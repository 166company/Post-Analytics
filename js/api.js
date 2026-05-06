// ─── Meta / Instagram Graph API ─────────────────────────────────────────────

const META_API_BASE  = 'https://graph.facebook.com/v20.0';
const MAX_PAGINATION = 30;
const MEDIA_LIMIT    = 100;

// LOCAL tarix string — timezone bug-unu önləmək üçün (toISOString UTC qaytarır)
function _localDateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ─── Reklam Hesablarını Al ───────────────────────────────────────────────────
async function fetchAdAccounts(userToken) {
  try {
    const res = await fetch(
      `${META_API_BASE}/me/adaccounts?fields=id,name&limit=50&access_token=${userToken}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(a => a.id);
  } catch { return []; }
}

// ─── Business Suite yanaşması: Facebook Page Post Insights ───────────────────
// Crosspost olan postlar üçün paid impressions Page Post Insights-dan gəlir.
// post_impressions_paid — Business Suite "Views: X from ads" ilə eyni mənbə.
// Bu yanaşma Ads Manager-dən daha sadədir: Page Access Token kifayət edir.
async function buildPaidDataMapFromPageInsights(managedPages, pageTokens, igIds, since, until) {
  const map = {}; // { igMediaId: { paid_impressions, organic_impressions, _paid_ratio } }

  const sinceTs = Math.floor(since.getTime() / 1000);
  const untilTs = Math.floor(until.getTime() / 1000);

  console.log('[PageInsights] Başladı, səhifə sayı:', managedPages.length);

  for (const page of managedPages) {
    if (!page.ig_id) continue;
    const token = pageTokens[page.id];
    if (!token) {
      console.log(`[PageInsights] ${page.name}: token yoxdur — keç`);
      continue;
    }

    try {
      // ── 1. Facebook page posts-larını çək ───────────────────────────────
      let postsUrl = new URL(`${META_API_BASE}/${page.id}/posts`);
      postsUrl.searchParams.set('fields', 'id,created_time');
      postsUrl.searchParams.set('since', sinceTs);
      postsUrl.searchParams.set('until', untilTs);
      postsUrl.searchParams.set('limit', '100');
      postsUrl.searchParams.set('access_token', token);

      const fbPosts = [];
      let nextUrl = postsUrl.toString();
      while (nextUrl) {
        const res = await fetch(nextUrl);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          console.warn(`[PageInsights] ${page.name} posts xətası:`, errBody);
          break;
        }
        const d = await res.json();
        fbPosts.push(...(d.data || []));
        nextUrl = d.paging?.next || null;
      }
      console.log(`[PageInsights] ${page.name}: ${fbPosts.length} FB post tapıldı`);

      // ── 2. Hər FB post üçün: instagram_media_id + paid insights ─────────
      for (const fbPost of fbPosts) {
        try {
          // Facebook post-dan bağlı Instagram media ID-sini tap
          const linkRes = await fetch(
            `${META_API_BASE}/${fbPost.id}?fields=instagram_media_id&access_token=${token}`
          );
          if (!linkRes.ok) continue;
          const linkData = await linkRes.json();
          const igId = linkData.instagram_media_id;
          if (!igId) {
            console.log(`[PageInsights] FB post ${fbPost.id}: instagram_media_id yoxdur`);
            continue;
          }
          console.log(`[PageInsights] FB post ${fbPost.id} → IG ${igId}`);

          // Paid/organic impressions — Business Suite ilə eyni mənbə
          const insRes = await fetch(
            `${META_API_BASE}/${fbPost.id}/insights` +
            `?metric=post_impressions_paid,post_impressions_organic,post_impressions` +
            `&period=lifetime&access_token=${token}`
          );
          if (!insRes.ok) continue;
          const insData = await insRes.json();

          const vals = {};
          (insData.data || []).forEach(m => {
            vals[m.name] = m.values?.[0]?.value ?? 0;
          });

          const paidImpr    = vals.post_impressions_paid    || 0;
          const orgImpr     = vals.post_impressions_organic || 0;
          const totalImpr   = vals.post_impressions         || (paidImpr + orgImpr) || 1;
          const paidRatio   = totalImpr > 0 ? paidImpr / totalImpr : 0;

          map[String(igId)] = {
            paid_impressions:    paidImpr,
            organic_impressions: orgImpr,
            total_impressions:   totalImpr,
            _paid_ratio:         paidRatio,
            // Engagement breakdown — paidRatio ilə hesablanır (Ads Manager yoxdursa)
            // Ads Manager varsa bunlar override edilir
            paid_likes:    0, paid_comments: 0,
            paid_shares:   0, paid_saves:    0,
            paid_views:    paidImpr, // views = impressions paid
            paid_reach:    0, paid_spend: 0, paid_engagement: 0
          };
        } catch (err) { console.warn(`[PageInsights] post xətası:`, err); }
      }
    } catch (err) { console.warn(`[PageInsights] ${page.name} səhifə xətası:`, err); }
  }

  console.log('[PageInsights] Yekun map:', Object.keys(map).length, 'post', map);
  return map;
}

// ─── Meta Ads → Paid Data Xəritəsi ──────────────────────────────────────────
//
// Problem: Ads "object_story_id" = "pageId_postId" (Facebook post ID)
//          Bizim postlar isə Instagram media ID-ləridir
// Həll:    object_story_id → pageId çıxar → Page Token ilə
//          /{pageId_postId}?fields=instagram_media_id sorğusu et
//
// pageTokens: { pageId: "page_access_token" } — Page Token lazımdır, User Token yox!
async function buildPaidDataMap(adAccountIds, userToken, since, until, pageTokens = {}) {
  const map = {}; // { igMediaId: paidMetrics }

  // action_type → metrik — istifadəçinin təlimatına uyğun
  // post_reaction → Like
  // comment       → Comment
  // post_save     → Save (Meta Ads-da bu adla gəlir)
  // post          → Share
  // video_view    → View (video/reels)
  // impressions   → View (foto)
  const ACTION_TO_METRIC = {
    // Likes
    'post_reaction':                  'paid_likes',
    'like':                           'paid_likes',
    // Comments
    'comment':                        'paid_comments',
    // Saves — Meta Ads-da hər iki variantda gələ bilər
    'post_save':                      'paid_saves',
    'onsite_conversion.post_save':    'paid_saves',
    // Shares
    'post':                           'paid_shares',
    'share':                          'paid_shares',
    // Total engagement (likes+comments+shares+saves cəmi)
    'post_engagement':                'paid_engagement',
    // Views
    'video_view':                     'paid_views',
    'reel_view':                      'paid_views',
    'video_15_sec_watched_actions':   'paid_views',
    'video_thruplay_watched_actions': 'paid_views',
  };

  const newEntry = () => ({
    paid_impressions: 0, paid_reach: 0, paid_spend: 0,
    paid_likes: 0, paid_comments: 0, paid_shares: 0,
    paid_saves: 0, paid_views: 0, paid_engagement: 0
  });

  // ── Facebook page post ID-dən Instagram media ID tap ─────────────────────
  // object_story_id = "pageId_postId" → Page Token ilə instagram_media_id çəkilir
  async function resolveStoryId(storyId) {
    const pageId   = storyId.split('_')[0];
    const token    = pageTokens[pageId] || userToken; // Page Token üstünlük verir
    try {
      const res = await fetch(
        `${META_API_BASE}/${storyId}?fields=instagram_media_id&access_token=${token}`
      );
      if (!res.ok) return null;
      const d = await res.json();
      return d.instagram_media_id ? String(d.instagram_media_id) : null;
    } catch { return null; }
  }

  console.log('[PaidData] Ads hesabları:', adAccountIds);
  console.log('[PaidData] Tarix aralığı:', _localDateStr(since), '→', _localDateStr(until));

  for (const actId of adAccountIds) {
    try {
      // ── 1. Reklamları çək + adId → mediaId xəritəsi qur ─────────────────
      const adToMedia = {}; // { adId: igMediaId }
      const pendingStories = {}; // { adId: storyId } — sonra resolve ediləcək

      const adsUrl = new URL(`${META_API_BASE}/${actId}/ads`);
      adsUrl.searchParams.set('fields',
        'id,creative{effective_instagram_media_id,object_story_id,effective_object_story_id}');
      adsUrl.searchParams.set('limit', '500');
      adsUrl.searchParams.set('access_token', userToken);

      let nextUrl = adsUrl.toString();
      let totalAds = 0;
      while (nextUrl) {
        const res = await fetch(nextUrl);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          console.warn(`[PaidData] ${actId} ads fetch xətası:`, errBody);
          break;
        }
        const data = await res.json();
        (data.data || []).forEach(ad => {
          totalAds++;
          const c = ad.creative || {};
          if (c.effective_instagram_media_id) {
            adToMedia[ad.id] = String(c.effective_instagram_media_id);
          } else {
            const story = c.effective_object_story_id || c.object_story_id;
            if (story) pendingStories[ad.id] = story;
          }
        });
        nextUrl = data.paging?.next || null;
      }

      console.log(`[PaidData] ${actId}: ${totalAds} reklam, `
        + `${Object.keys(adToMedia).length} birbaşa IG ID, `
        + `${Object.keys(pendingStories).length} story resolve lazımdır`);

      // ── 2. Crosspost story ID-lərini paralel resolve et (max 50) ────────
      const storyEntries = Object.entries(pendingStories).slice(0, 50);
      const resolved = await Promise.allSettled(
        storyEntries.map(([adId, storyId]) =>
          resolveStoryId(storyId).then(igId => ({ adId, igId }))
        )
      );
      let resolvedCount = 0;
      resolved.forEach(r => {
        if (r.status === 'fulfilled' && r.value.igId) {
          adToMedia[r.value.adId] = r.value.igId;
          resolvedCount++;
        }
      });
      console.log(`[PaidData] ${actId}: ${resolvedCount}/${storyEntries.length} story resolve edildi`);
      console.log(`[PaidData] ${actId}: adToMedia cəmi:`, Object.keys(adToMedia).length, adToMedia);

      if (Object.keys(adToMedia).length === 0) {
        console.warn(`[PaidData] ${actId}: heç bir ad→igMedia mapping yoxdur — keç`);
        continue;
      }

      // ── 3. Ads Insights çək ───────────────────────────────────────────────
      const insUrl = new URL(`${META_API_BASE}/${actId}/insights`);
      insUrl.searchParams.set('level', 'ad');
      insUrl.searchParams.set('fields',
        'ad_id,impressions,reach,spend,actions,video_avg_time_watched_actions');
      insUrl.searchParams.set('action_breakdowns', 'action_type');
      insUrl.searchParams.set('time_range', JSON.stringify({
        since: _localDateStr(since),
        until: _localDateStr(until)
      }));
      insUrl.searchParams.set('filtering', JSON.stringify([{
        field: 'ad.effective_status',
        operator: 'IN',
        value: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'DELETED']
      }]));
      insUrl.searchParams.set('limit', '500');
      insUrl.searchParams.set('access_token', userToken);

      let insNext = insUrl.toString();
      let insRows = 0;
      while (insNext) {
        const res = await fetch(insNext);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          console.warn(`[PaidData] ${actId} insights xətası:`, errBody);
          break;
        }
        const data = await res.json();
        (data.data || []).forEach(row => {
          insRows++;
          const igId = adToMedia[row.ad_id];
          if (!igId) {
            console.log(`[PaidData] ad_id ${row.ad_id} xəritədə yoxdur — keç`);
            return;
          }
          if (!map[igId]) map[igId] = newEntry();
          const m = map[igId];
          m.paid_impressions += parseInt(row.impressions || 0);
          m.paid_reach       += parseInt(row.reach       || 0);
          m.paid_spend       += parseFloat(row.spend     || 0);
          const av = {};
          (row.actions || []).forEach(a => {
            av[a.action_type] = (av[a.action_type] || 0) + parseInt(a.value || 0);
          });
          console.log(`[PaidData] ad ${row.ad_id} → ig ${igId} actions:`, av);
          Object.entries(av).forEach(([type, val]) => {
            const metric = ACTION_TO_METRIC[type];
            if (metric) m[metric] += val;
          });
        });
        insNext = data.paging?.next || null;
      }
      console.log(`[PaidData] ${actId}: ${insRows} insight sətri, map:`, Object.keys(map).length, 'post');

    } catch (err) {
      console.error(`[PaidData] ${actId} xəta:`, err);
    }
  }

  console.log('[PaidData] Yekun map:', map);
  return map;
}

// ─── İdarə Edilən Səhifələr + Bağlı Instagram Hesabları ─────────────────────
// Üç üsulla Instagram ID-ni tapır:
//   1) instagram_business_account  — standart Business hesab
//   2) /{page-id}/instagram_accounts — Creator hesab / Business Suite
//   3) Hər ikisi uğursuz olarsa ig_id = null
async function fetchManagedPages(userToken) {
  let url = [
    `${META_API_BASE}/me/accounts`,
    `?fields=id,name,access_token,instagram_business_account`,
    `&limit=100`,
    `&access_token=${userToken}`
  ].join('');

  const pages = [];
  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error || {});
    }
    const data = await res.json();
    if (data.data && data.data.length) pages.push(...data.data);
    url = data.paging && data.paging.next ? data.paging.next : null;
  }

  const result = pages.map(p => ({
    id:           p.id,
    name:         p.name,
    access_token: p.access_token,
    ig_id:        p.instagram_business_account ? p.instagram_business_account.id : null
  }));

  // Üsul 2 — instagram_business_account olmayan səhifələr üçün
  // /{page-id}/instagram_accounts endpoint-i Business Suite / Creator hesabları ilə işləyir
  await Promise.all(
    result
      .filter(p => !p.ig_id)
      .map(async p => {
        p.ig_id = await _fetchIgViaEdge(p.id, p.access_token || userToken);
      })
  );

  return result;
}

// Fallback — /{page-id}/instagram_accounts edge-i
async function _fetchIgViaEdge(pageId, token) {
  try {
    const res = await fetch(
      `${META_API_BASE}/${encodeURIComponent(pageId)}/instagram_accounts?fields=id&limit=1&access_token=${token}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.data && data.data.length > 0 ? data.data[0].id : null;
  } catch {
    return null;
  }
}

// ─── Instagram Media Yüklə ──────────────────────────────────────────────────
// ig_id: Instagram Business Account ID (facebook.page.instagram_business_account.id)
// pageToken: həmin Facebook səhifəsinin Page Access Token-i
async function fetchInstagramMedia(igId, pageToken, since, until, onProgress) {
  const sinceTs = Math.floor(since.getTime() / 1000);
  const untilTs = Math.floor(until.getTime() / 1000);

  // collaborators{id,username} — ID ilə collab cross-attribution, username UI üçün
  let nextUrl = [
    `${META_API_BASE}/${encodeURIComponent(igId)}/media`,
    `?fields=id,timestamp,media_type,media_product_type,collaborators{id,username},like_count,comments_count,permalink,media_url,thumbnail_url`,
    `&since=${sinceTs}`,
    `&until=${untilTs}`,
    `&limit=${MEDIA_LIMIT}`,
    `&access_token=${pageToken}`
  ].join('');

  const allMedia = [];
  let pageCount  = 0;

  while (nextUrl && pageCount < MAX_PAGINATION) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error || {});
    }
    const body = await res.json();

    if (body.data && body.data.length > 0) {
      allMedia.push(...body.data);
      if (typeof onProgress === 'function') onProgress(allMedia.length);
    }

    nextUrl = body.paging && body.paging.next ? body.paging.next : null;
    pageCount++;
  }

  // Normallaşdır — story-ləri çıxart
  return allMedia
    .map(m => {
      const type = inferInstagramType(m);
      if (!type) return null; // story → skip

      const collabRaw = m.collaborators?.data || [];
      // Həm ID həm username saxla — ID daha etibarlı, username fallback
      const collaboratorIgIds    = collabRaw.map(c => c.id).filter(Boolean);
      const collaboratorUsernames = collabRaw.map(c => c.username).filter(Boolean);

      const thumb = m.thumbnail_url || m.media_url || null;

      return {
        id:                     m.id,
        created_time:           m.timestamp,
        type,
        is_collab:              collaboratorIgIds.length > 0 || collaboratorUsernames.length > 0,
        collaborator_ig_ids:    collaboratorIgIds,
        collaborator_usernames: collaboratorUsernames,
        like_count:             m.like_count     || 0,
        comments_count:         m.comments_count  || 0,
        permalink:              m.permalink       || null,
        thumb                                               // thumbnail URL
      };
    })
    .filter(Boolean);
}

// ─── Yalnız Post ID-lərini Al (collab aşkarlama üçün) ───────────────────────
// Tam məlumat yox — yalnız id field-i. Sürətli və yüngüldür.
async function fetchInstagramMediaIds(igId, token, since, until) {
  const sinceTs = Math.floor(since.getTime() / 1000);
  const untilTs = Math.floor(until.getTime() / 1000);

  let url = [
    `${META_API_BASE}/${encodeURIComponent(igId)}/media`,
    `?fields=id`,
    `&since=${sinceTs}`,
    `&until=${untilTs}`,
    `&limit=100`,
    `&access_token=${token}`
  ].join('');

  const ids = [];
  let pageCount = 0;

  while (url && pageCount < 5) { // max 5 səhifə (500 ID) — sürəti qorumaq üçün
    const res = await fetch(url);
    if (!res.ok) break;
    const data = await res.json();
    if (data.data) ids.push(...data.data.map(m => m.id));
    url = data.paging?.next || null;
    pageCount++;
  }

  return ids;
}

// ─── Instagram Hesab Adı ─────────────────────────────────────────────────────
async function fetchIgUsername(igId, token) {
  try {
    const res = await fetch(`${META_API_BASE}/${igId}?fields=id,username&access_token=${token}`);
    if (!res.ok) return null;
    const d = await res.json();
    return d.username || null;
  } catch { return null; }
}

// ─── Top Post Insights (max 15 post, rate limit riski azaltmaq üçün) ─────────
// Returned: { [mediaId]: { reach, saved, paid_impressions, organic_impressions } }
// paidMap: buildPaidDataMap()-dən gələn { igMediaId → paid metrics } xəritəsi
async function fetchInsightsForTopPosts(topPosts, paidMap = {}) {
  const results = {};
  const limited = topPosts.slice(0, 15);

  // Bir metrik fetch edir, xəta baş verərsə səssizcə keçir
  async function tryMetric(mediaId, metric, token) {
    try {
      const res = await fetch(
        `${META_API_BASE}/${mediaId}/insights?metric=${metric}&period=lifetime&access_token=${token}`
      );
      if (!res.ok) return {};
      const data = await res.json();
      const out = {};
      (data.data || []).forEach(m => {
        out[m.name] = m.total_value?.value ?? m.values?.[0]?.value ?? 0;
      });
      return out;
    } catch { return {}; }
  }

  await Promise.allSettled(
    limited.map(async post => {
      const token = post._pageToken;
      if (!token) return;
      results[post.id] = {};
      const r = results[post.id];

      // ── Həmişə işləyən metriklər ──────────────────────────────────────────
      Object.assign(r, await tryMetric(post.id, 'reach,saved,shares', token));

      // ── Baxış sayı — post tipinə görə ──────────────────────────────────
      // Hər metrik ayrı sorğuda — biri fail etsə digərləri zərər görmür
      //
      // Reels: ig_reels_aggregated_all_plays_count (yeni) → plays (köhnə)
      if (post.type === 'reels') {
        const plays = await tryMetric(post.id, 'ig_reels_aggregated_all_plays_count', token);
        if (plays.ig_reels_aggregated_all_plays_count > 0) {
          r.plays = plays.ig_reels_aggregated_all_plays_count;
        } else {
          Object.assign(r, await tryMetric(post.id, 'plays', token));
        }
      }
      // Video (reel olmayan): video_views
      if (post.type === 'other') {
        Object.assign(r, await tryMetric(post.id, 'video_views', token));
      }
      // Foto / carousel + bütün tiplər üçün fallback: impressions
      const impr = await tryMetric(post.id, 'impressions', token);
      Object.assign(r, impr); // mövcuddursa əlavə et, yoxdursa narahatlıq yoxdur

      // ── Paid data — Business Suite ilə eyni mənbə ────────────────────────
      // Business Suite Content → "Marketing Channel: Paid" filtri
      // Instagram Graph API: breakdown=source_type → PAID hissə = "from ads"

      // Köməkçi: source_type=PAID dəyərini çıxar
      function getPaid(apiData, metricName) {
        const m = (apiData.data || []).find(x => x.name === metricName);
        if (!m) return { total: 0, paid: 0 };
        const bds = m.total_value?.breakdowns?.[0]?.results || [];
        let paid = 0;
        bds.forEach(item => {
          if ((item.dimension_values || []).includes('PAID')) paid += item.value || 0;
        });
        return { total: m.total_value?.value || 0, paid };
      }

      // Sorğu 1: impressions + reach — views "from ads" üçün
      try {
        const rImpr = await fetch(
          `${META_API_BASE}/${post.id}/insights?metric=impressions,reach&breakdown=source_type&period=lifetime&access_token=${token}`
        );
        if (rImpr.ok) {
          const dImpr = await rImpr.json();
          const impr = getPaid(dImpr, 'impressions');
          const rch  = getPaid(dImpr, 'reach');
          r.paid_impressions  = impr.paid;
          r.total_impressions = impr.total || r.impressions || 0;
          r.reach_paid        = rch.paid;
          r._paid_ratio = r.total_impressions > 0
            ? r.paid_impressions / r.total_impressions : 0;
        }
      } catch { /* keç */ }

      // Sorğu 2: total_interactions — Business Suite "Interactions from ads"
      // Bu əsas paid engagement metrikasıdır
      try {
        const rTot = await fetch(
          `${META_API_BASE}/${post.id}/insights?metric=total_interactions&breakdown=source_type&period=lifetime&access_token=${token}`
        );
        if (rTot.ok) {
          const dTot = await rTot.json();
          const tot  = getPaid(dTot, 'total_interactions');
          r.total_interactions_total = tot.total;
          r.total_interactions_paid  = tot.paid;   // Business Suite "4 from ads"
        }
      } catch { /* keç */ }

      // Sorğu 3: hər metrik ayrıca breakdown — Business Suite "Likes: 94 (4 from ads)"
      // likes, comments, shares, saved üçün source_type breakdown cəhdi
      try {
        const rEngage = await fetch(
          `${META_API_BASE}/${post.id}/insights?metric=likes,comments,shares,saved&breakdown=source_type&period=lifetime&access_token=${token}`
        );
        if (rEngage.ok) {
          const dEngage = await rEngage.json();
          const lk = getPaid(dEngage, 'likes');
          const cm = getPaid(dEngage, 'comments');
          const sh = getPaid(dEngage, 'shares');
          const sv = getPaid(dEngage, 'saved');
          r.likes_paid    = lk.paid;
          r.comments_paid = cm.paid;
          r.shares_paid   = sh.paid;
          r.saved_paid    = sv.paid;
          r.likes_total   = lk.total;
          r.comments_total = cm.total;
          r.shares_total   = sh.total;
          r.saved_total    = sv.total;
        }
      } catch { /* API bu metrikləri breakdown ilə dəstəkləmirsə ratio istifadə ediləcək */ }
    })
  );

  // ── paidMap-dən Ads Insights datası tətbiq et ────────────────────────────
  // Bu "yalnız reklamdan gələn" nəticələrdir — organic deyil
  // Instagram insights breakdown-undan daha dəqiqdir
  topPosts.forEach(post => {
    const ads = paidMap[post.id];
    if (!ads) return;
    // paid data mövcud olub-olmadığını yoxla — impressions, engagement, views hər hansı biri
    const hasPaid = (ads.paid_impressions || 0) > 0
                 || (ads.paid_engagement  || 0) > 0
                 || (ads.paid_likes       || 0) > 0
                 || (ads.paid_views       || 0) > 0;
    if (!hasPaid) return;
    const r = results[post.id];
    if (!r) return;

    if ((ads.paid_impressions || 0) > 0) {
      r.paid_impressions = ads.paid_impressions;
      r.reach_paid       = ads.paid_reach;
      // Nisbəti yenilə — bu ratio view-ların paid hissəsi üçün istifadə olunur
      const total = r.impressions || r.total_impressions || 1;
      r._paid_ratio = ads.paid_impressions / total;
    }

    r.likes_paid      = ads.paid_likes;
    r.comments_paid   = ads.paid_comments;
    r.shares_paid     = ads.paid_shares;
    r.saved_paid      = ads.paid_saves;
    r._ads_views_paid = ads.paid_views;
    r.paid_spend      = ads.paid_spend;

    // paid_engagement → total_interactions_paid fallback:
    // Ads Manager-dən gələn ümumi paid engagement-i ratio hesablaması üçün istifadə et
    // (ayrı-ayrı metrik breakdown olmadığı halda)
    if ((ads.paid_engagement || 0) > 0 && !r.total_interactions_paid) {
      r.total_interactions_paid = ads.paid_engagement;
      const engTotal = (r.likes_total || r.likes || 0)
                     + (r.comments_total || r.comments || 0)
                     + (r.saved_total   || r.saved   || 0)
                     + (r.shares_total  || r.shares  || 0);
      if (engTotal > 0) r.total_interactions_total = engTotal;
    }
  });

  return results;
}

// ─── Instagram Post Tipi ─────────────────────────────────────────────────────
function inferInstagramType(media) {
  // Story-ləri daxil etmə
  if (media.media_product_type === 'STORY') return null;

  // Reels — media_product_type === 'REELS' ən dəqiq üsuldur
  if (media.media_product_type === 'REELS') return 'reels';

  // Carousel (çox şəkil/video albumı)
  if (media.media_type === 'CAROUSEL_ALBUM') return 'carousel';

  // Tək şəkil
  if (media.media_type === 'IMAGE') return 'photo';

  // Video (reel olmayan — köhnə format)
  if (media.media_type === 'VIDEO') return 'other';

  return 'other';
}

// ─── Bağlantı Testi ──────────────────────────────────────────────────────────
async function testApiConnection(token) {
  const res = await fetch(`${META_API_BASE}/me?fields=id,name&access_token=${token}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || {});
  }
  return res.json();
}

// ─── API Xəta Sinfi ──────────────────────────────────────────────────────────
class ApiError extends Error {
  constructor(httpStatus, errorObj = {}) {
    super(errorObj.message || 'API xətası baş verdi');
    this.name       = 'ApiError';
    this.httpStatus = httpStatus;
    this.code       = errorObj.code;
    this.type       = errorObj.type;
  }

  toUserMessage() {
    const c = this.code, s = this.httpStatus;
    if (s === 401 || c === 190 || c === 102)
      return 'Token etibarsızdır və ya müddəti bitib. Yeni token alın.';
    if (c === 4 || c === 17 || c === 32 || c === 613 || s === 429)
      return 'API sorğu limiti aşıldı. Bir neçə dəqiqə gözləyin.';
    if (c === 10 || c === 200 || c === 230 || s === 403)
      return 'Giriş icazəsi yoxdur. instagram_basic icazəsini əlavə edin.';
    if (s === 404 || c === 100)
      return 'Hesab tapılmadı. Instagram Biznes hesabı bağlı olmalıdır.';
    if (!navigator.onLine)
      return 'İnternet bağlantısı yoxdur.';
    return this.message || 'Bilinməyən xəta baş verdi.';
  }
}

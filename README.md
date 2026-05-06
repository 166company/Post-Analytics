# Yük Taksi 166 — Post Analitika Paneli

Meta (Facebook) səhifələri üçün post statistikasını izləyən, premium qara-sarı dizaynlı veb tətbiq.

---

## 1. Layihə Haqqında

Bu tətbiq Meta Graph API vasitəsilə Facebook səhifələrindən post məlumatlarını çəkir və vizual olaraq təhlil edir:

- **Aylıq post paylanması** — səhifələrə görə grouped bar chart
- **Post tip analizi** — şəkil, video, reels, status, link, album, tədbir
- **Canlı statistika** — ümumi post, aktiv səhifə, ən aktiv səhifə, gündəlik orta
- **Tarix filtrləri** — xüsusi aralıq seçimi + sürətli düymələr (bu gün, 7/30/90 gün, 6 ay, 1 il)

---

## 2. Quraşdırma

**Addım 1 — Layihəni endirin**
```
git clone <repo-url>
cd post-analytics
```

**Addım 2 — Tətbiqi açın**

Heç bir build addımı tələb olunmur. `index.html` faylını birbaşa brauzerdə açın:
```
# Windows
start index.html

# macOS
open index.html

# Və ya VS Code ilə Live Server istifadə edin
```

**Addım 3 — Token daxil edin**

Tətbiq açıldıqdan sonra "Parametrlər" düyməsinə basıb token və səhifə ID-lərini daxil edin.

---

## 3. Meta Graph API Tokeni Necə Alınır

1. [developers.facebook.com](https://developers.facebook.com) saytına daxil olun
2. Sol menyudan **Tools → Graph API Explorer** seçin
3. Sağ üstdə **Meta App** seçin (yoxdursa yeni app yaradın)
4. **User or Page** bölməsindən **Page Access Token** seçin
5. Analiz etmək istədiyiniz səhifəni seçin
6. `pages_read_engagement` və `pages_read_user_content` icazələrini əlavə edin
7. **Generate Access Token** düyməsinə basın
8. Yaradılan tokeni kopyalayıb tətbiqə yapışdırın

> **Qeyd:** Graph API Explorer tokenləri qısa müddətlidir (~1 saat). Uzun müddətli token üçün Access Token Debugger → Extend Token istifadə edin.

---

## 4. İstifadə Qaydaları

### Məlumat Yükləmə
1. **Parametrlər** panelini açın
2. **Page Access Token** sahəsinə tokeninizi daxil edin
3. **Səhifə ID-ləri** sahəsinə ID-ləri vergüllə ayırın (məs: `123456, 789012`)
4. Tarix aralığı seçin
5. **Yüklə** düyməsinə basın

### Səhifə ID-sini Necə Tapmalı
- Facebook səhifəsini açın → **About / Haqqında** bölməsi → **Page ID**
- Və ya URL-dən: `facebook.com/123456789` → ID: `123456789`

### Demo Rejimi
Hər hansı token olmadan sınaqdan keçirmək üçün **Demo Data** düyməsinə basın. 3 nümunə səhifə üçün avtomatik məlumat yaranır.

### Qrafik Tipləri
| Tab | Tip | Açıqlama |
|-----|-----|----------|
| Səhifələrə görə | Grouped Bar | Hər ay hər səhifənin post sayı yan-yana |
| Post tipinə görə | Stacked Bar | Hər ay post tiplərinin yığılmış görünüşü |

---

## 5. Təhlükəsizlik Xəbərdarlıqları

> **ÇOX VACİB — Oxuyun!**

- Token **sessionStorage**-da saxlanılır — brauzer yenilənərkən qalır, lakin tab bağlananda silinir
- Token **localStorage**-da saxlanılmır — cihaz paylaşıldıqda təhlükəsizdir
- Token **heç vaxt kodda yazılmamalıdır** (hardcoded)
- `.env` faylını **heç vaxt Git-ə commit etməyin** — `.gitignore`-a əlavə edilib
- Token console-a, log-a və ya xəta mesajına **çap edilmir**
- İstifadəçi interfeysi token inputunu **password tipi** ilə gizlədir

```bash
# YANLIŞ — Bunu heç vaxt etmə:
const TOKEN = "EAAxxxxx...";  # ← Token kodda

# DÜZGÜN — Tətbiqdəki metod:
# Token yalnız istifadəçi tərəfindən input sahəsinə daxil edilir
# sessionStorage-da müvəqqəti saxlanılır
```

---

## 6. Problemlər və Həllər (Troubleshooting)

### Token Müddəti Bitib
**Xəta:** `Token etibarsızdır və ya müddəti bitib`

**Həll:** Graph API Explorer-dən yeni token alın. Uzun müddətli token üçün:
1. [developers.facebook.com/tools/accesstoken](https://developers.facebook.com/tools/accesstoken) açın
2. Tokeninizi yapışdırıb **Extend** edin (60 günlük olur)

---

### Rate Limit (Sorğu Limiti)
**Xəta:** `API sorğu limiti aşıldı`

**Səbəb:** Meta API saatda 200 sorğu limiti qoyur.

**Həll:**
- 15-30 dəqiqə gözləyin
- Daha az səhifə ID-si istifadə edin
- Tarix aralığını azaldın

---

### İcazə Xətası
**Xəta:** `Bu səhifəyə giriş icazəniz yoxdur`

**Həll:**
- **Page Access Token** istifadə etdiyinizə əmin olun (User Token işləmir)
- Token yaradarkən `pages_read_engagement` icazəsini əlavə edin
- Yalnız **admin olduğunuz** səhifələri analiz edə bilərsiniz

---

### Səhifə Tapılmadı
**Xəta:** `Səhifə tapılmadı`

**Həll:**
- Səhifə ID-sinin düzgün olduğunu yoxlayın (yalnız rəqəmlər)
- Səhifənin hələ mövcud olduğunu yoxlayın
- Token həmin səhifəyə aid olmalıdır

---

### CORS Xətası
**Problem:** Localhost-da API sorğusu bloklanır

**Həll:** Faylı birbaşa açmaq əvəzinə local server istifadə edin:
```bash
# Python ilə
python -m http.server 8080

# Node.js ilə
npx serve .

# VS Code Live Server extension
```

---

## Texnologiyalar

- **Vanilla HTML/CSS/JavaScript** — heç bir framework yoxdur
- **Chart.js 4.4.1** — qrafiklər üçün
- **Meta Graph API v19.0** — Facebook məlumatları üçün
- **Manrope + JetBrains Mono** — Google Fonts

---

*Yük Taksi 166 Post Analitika Paneli — Bütün hüquqlar qorunur*

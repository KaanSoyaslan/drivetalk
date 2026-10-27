# DriveTalk

Araba sürerken eller serbest İngilizce konuşma pratiği. Telefonda Chrome'da çalışan bir web uygulaması (PWA). Kurulum, sunucu ya da ücret gerektirmez; kullanılan her şey ücretsizdir.

## Nasıl çalışır

Sohbet partnerinin adı **Sam**. İki ses modu var; ikisini de Konuş ekranındaki **Ses** kutusundan seçebilirsin.

| | Klasik | Canlı (Gemini Live) |
|---|---|---|
| Ses | Telefonun kendi İngilizce sesi | Doğal insan sesi (8 ses arasından seçilir) |
| Hız | Her cevap için yaklaşık 1–3 saniye bekleme | Neredeyse anında cevap |
| Sözünü kesmek | Yok, Sam'in bitirmesini beklersin | Var, konuşmaya başlayınca Sam susar |
| Telaffuz | Değerlendirmez (sadece yazıya dökülen metni görür) | Sesini duyar, ara sıra yanlış söylenen kelimeyi düzeltir |
| Durum | Demo modunda ve gerçek Google sunucusunda denendi | Yeni. Gerçek bir anahtarla henüz denenmedi (bkz. *Bilinen sınırlamalar*) |

Canlı mod açılamazsa (kota dolması, bağlantı sorunu gibi) uygulama kendiliğinden Klasik moda geçer ve sohbet devam eder.

Her iki modda da:
- Sam konuşmanı sürdürür. Hata yaparsan doğru hâlini cevabında doğal şekilde kullanır.
- **Koç** her cümleni arka planda inceler ve düzeltmeleri kaydeder (ne dedin → nasıl daha iyi olur → neden).
- Güncel bir bilgi gerekirse (hava durumu, haber, döviz, bir konu hakkında bilgi) Sam telefondan ücretsiz kaynaklara bakar.

**Geri bildirim modları** (Konuş ekranında seçilir):

| Mod | Ne yapar |
|---|---|
| Ara ara (varsayılan) | Her 5 cümlede bir en önemli 2 hatayı kısaca söyler |
| Anında | Belirgin bir hata yaptığın anda tek bir kısa ipucu verir |
| Sadece sonda | Sohbet sırasında hiç bölmez |

Oturum bitince Sam sesli bir özet verir. Özet aynı zamanda öğrenmeye değer 5 ifadeyi seçip **kelime defterine** ekler. Bütün düzeltmeler Türkçe açıklamalarıyla **Geçmiş** sekmesine kaydedilir; park edince ya da evde bakarsın.

## Konular

- **Sohbet:** Serbest, Gündem (günün haberleri), İlginç bilgiler, Günlük hayat, İş, Seyahat, Small talk, Fikirler
- **Rol yapma:** İş mülakatı, Havalimanı, Otel, Restoran, Doktor, Müşteri hizmetleri, Mağaza. Sam bir rol oynar (resepsiyonist, garson, doktor…) ve araya küçük sorunlar ekler. Senaryo bitince ne kadar iyi yaptığını söyler ve yenisini önerir.
- **Pratik:**
  - *Dinleme:* Sam seviyene uygun kısa bir haber ya da hikâye anlatır, sonra anlama soruları sorar.
  - *Kelime tekrarı:* Oturum kelime testiyle başlar.

Listede olmayan bir konu için kutuya kendi konunu da yazabilirsin.

## Canlı bilgi (tamamen ücretsiz)

Arama telefonun kendisinden yapılır; kaynakların hiçbiri hesap, API anahtarı ya da ödeme istemez:

| Sorduğun | Kaynak |
|---|---|
| "What's the weather like tomorrow?" | [Open-Meteo](https://open-meteo.com) |
| "Is there any news about Serbia?" | Wikipedia: *In the news* ve *Current events* (son 3 gün) |
| "Tell me about the Hagia Sophia." | Wikipedia |
| "How much is the dollar today?" | [Frankfurter](https://frankfurter.dev) (Avrupa Merkez Bankası kurları) |

Ne zaman bakacağına Sam kendisi karar verir. Geçmiş ekranında nereye baktığı 🔎 ile görünür.

**Hava durumu için konum:** Şehir söylemezsen *Ayarlar → Canlı bilgi* bölümündeki şehir kullanılır. İstersen bunun yerine telefonun konumunu kullandırabilirsin; o kutuyu park halindeyken işaretle ki izin penceresi o an çıksın. Konum sadece Open-Meteo'ya koordinat olarak gönderilir.

> Sınırlama: Bu kaynaklar genel bilgi ve haberler için iyidir. Maç skoru, yerel haber ya da bir ürünün fiyatı gibi çok özel bilgileri bazen bulamaz. O durumda Sam bulamadığını söyler, uydurmaz.

## Kelime defteri ve İlerleme

**İlerleme** sekmesinde şunlar var:
- **Özet kutuları:** bu haftaki konuşma süresi, seri (art arda pratik yaptığın gün sayısı), toplam cümle sayısı, öğrenilen ifadeler.
- **Haftalık grafik:** son 8 haftanın konuşma süresi. Bir çubuğa dokununca o haftanın sayıları çıkar.
- **Hata oranı:** 10 cümlede kaç düzeltme yapıldığı ve bunun azalıp azalmadığı.
- **Hata türleri:** dilbilgisi, kelime seçimi ve doğallık.
- **Kelime defteri:** Oturum özetlerinden otomatik dolar; elle ifade de ekleyebilirsin. Tekrar sistemi aralıklıdır: doğru bildiğin ifade 1, 3, 7, 16 ve 35 gün sonra yeniden sorulur, yanlış bildiğin baştan başlar. 5. aşamaya gelen ifade "öğrenildi" sayılır.

Tekrar etmek için sohbette **"quiz me"** demen ya da **Kelime tekrarı** konusunu seçmen yeterli. Sam ayrıca sıradaki ifadeleri kullanman için sohbette fırsat yaratır.

## Kurulum (bir kez, ~15 dakika)

### 1. Ücretsiz Gemini API anahtarı al

1. <https://aistudio.google.com/apikey> adresine Google hesabınla gir.
2. **Create API key** → anahtarı kopyala.

> Ücretsiz katmanda Google, Gemini'ye gönderilen içeriği kendi ürünlerini geliştirmek için kullanabilir. Klasik modda Gemini'ye sadece yazıya dökülmüş metin gider; konuşma tanıma Chrome üzerinden Google'ın sunucularında yapılır. Canlı modda ise sesin doğrudan Gemini'ye gider.

### 2. Uygulamayı internete koy (GitHub Pages, ücretsiz)

Mikrofonun çalışması için sayfanın `https://` ile açılması şart.

1. <https://github.com> üzerinde hesap aç ya da giriş yap.
2. **New repository** → ad: `drivetalk` → **Public** → **Create repository**.
3. **uploading an existing file** bağlantısına tıkla ve bu klasörün **içindekileri** sürükle (`index.html` en üst seviyede olmalı) → **Commit changes**.
4. **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, klasör: `/ (root)` → **Save**.
5. 1-2 dakika sonra adresin hazır olur: `https://KULLANICI-ADIN.github.io/drivetalk/`

API anahtarı koda yazılmadığı için repo herkese açık olsa da sorun yok; anahtar sadece telefonunda saklanır.

### 3. Telefona kur

1. Telefonda **Chrome** ile adresi aç → ⋮ menü → **Ana ekrana ekle** / **Uygulamayı yükle**.
2. Uygulamayı aç → **Ayarlar** → API anahtarını yapıştır. Anahtarı telefona kendine e-posta atarak ya da AI Studio'yu doğrudan telefonda açarak alabilirsin.
3. **Ses modu**nu seç. Canlı modda **Sam'in sesi**ni seç; Klasik modda **İngilizce ses** listesinden bir ses seçip **Dene** ile dinle.
4. **Konuş** → **Başla** → mikrofon iznine **İzin ver**.

Eski telefon için: Android'i ve Chrome'u güncelle. Ayrıca *Ayarlar → Uygulamalar → Chrome → Pil* yolundan **Kısıtlanmamış** seç.

### 4. Arabada

- Telefonu bir tutucuya tak ve şarja bağla. Uygulama çalışırken ekranı kendisi açık tutar.
- Bluetooth ile araca bağlanırsan Sam'in sesi araç hoparlöründen gelir.
- **Başla'ya park halindeyken bas**; sonrası tamamen sesle yürür. Sustuğunda cevap kendiliğinden gelir, hiçbir yere basman gerekmez.
- Ekranda Sam'in yüzü var. Çevresindeki halkanın rengi durumu gösterir: yeşil = dinliyor, turuncu = düşünüyor, mavi = konuşuyor, gri = duraklatıldı.
- Yüzün altındaki **ses çubuğu** sen konuşurken senin sesinle (yeşil), Sam konuşurken onun sesiyle (mavi) yükselir. Böylece sesinin gittiğini görürsün. Sam konuşurken ağzı da sesine göre hareket eder.
- Söylediklerin konuştukça ekrana yazılır.
- **Direksiyon / kulaklık tuşları:**
  - ▶❚❚ duraklatır ya da devam ettirir.
  - ⏭ konuyu değiştirir.
  - ⏮ Sam'in son söylediğini tekrarlatır.

  Araç ekranında "DriveTalk" yazar. Tuşların çalışması araca ve telefona göre değişir; sorun çıkarırsa *Ayarlar → Ses modu* bölümünden kapatabilirsin.
- Canlı modda araç hoparlöründen gelen ses Sam'i kendi kendine durduruyorsa *Ayarlar → Sam konuşurken sözünü kesebileyim* seçeneğini kapat.

## Sesli komutlar

| Söyle | Ne olur |
|---|---|
| "feedback", "how am I doing?" | Henüz söylenmemiş hatalarını okur |
| "quiz me" | Kelime defterinden test yapar |
| "repeat", "say that again" | Sam son cümlesini tekrarlar |
| "slower" / "faster" | Konuşma hızını değiştirir |
| "new topic", "next question" | Konuyu değiştirir |
| "pause", "hold on", "wait a second" | Bekler. Klasik modda **"continue"** deyince, Canlı modda daireye dokununca ya da ▶ tuşuna basınca devam eder. |
| "end session", "that's all for today" | Sesli özet verir ve oturumu bitirir |

Klasik modda en fazla 6 kelimelik kısa cümleler komut olarak algılanır. Canlı modda Sam ne istediğini kendisi anlar; kelimesi kelimesine söylemen gerekmez. Ekrandaki daireye dokunarak da kontrol edebilirsin: Sam konuşurken dokunursan konuşmayı atlar.

## Bilinen sınırlamalar

- **Canlı mod gerçek bir anahtarla henüz denenmedi.**
  - Doğrulananlar:
    - Kurulum mesajının biçimi Google'ın sunucusunda kontrol edildi.
    - Mikrofon sesinin doğru biçime çevrildiği denendi.
    - Akışın tamamı (cevap, arama, test, duraklatma, bitirme) demo sunucusuyla denendi.
  - Ücretsiz katmanın Canlı mod için günlük sınırını sadece AI Studio gösteriyor.
  - İlk denemede sorun olursa uygulama zaten Klasik moda geçer.
- **Ekran açık kalmalı.** Ekran kilitlenirse Chrome dinlemeyi durdurur.
- Klasik modda bazı Android telefonlar her dinleme başında kısa bir **bip** sesi çıkarır. Canlı modda bu olmaz.
- **İnternet gerekli.** Bağlantı koparsa (örneğin tünelde) uygulama birkaç kez yeniden dener; Canlı mod sohbete kaldığı yerden devam eder.
- Ücretsiz katmanın dakikalık ve günlük sınırları var. Güncel sınırları AI Studio'da görebilirsin.
- Google zamanla eski modelleri kaldırıyor. Model hatası alırsan *Ayarlar → Gelişmiş* bölümünden model adını güncelle.

## Bilgisayarda deneme

Bu klasörde:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Ardından Chrome'da <http://localhost:8080> adresini aç.
- API anahtarı olmadan hazır cevaplarla denemek için <http://localhost:8080/?demo> kullan. Demo modunda Canlı mod da sahte bir sunucuyla çalışır.
- Mikrofonsuz test için: *Ayarlar → Gelişmiş → Yazarak test modu*.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `index.html`, `css/style.css` | Arayüz |
| `js/app.js` | Oturum döngüsü (Klasik ve Canlı), ekranlar, ilerleme, ayarlar |
| `js/live.js` | Gemini Live istemcisi: gerçek zamanlı ses, yeniden bağlanma |
| `js/pcm-worklet.js` | Mikrofon sesini 16 kHz PCM'e çevirir |
| `js/live-mock.js` | Demo modu için sahte Canlı mod sunucusu |
| `js/speech.js` | Klasik mod: konuşma tanıma ve sesli okuma |
| `js/gemini.js` | Gemini API istemcisi ve demo modu |
| `js/tutor.js` | Sam, koç, kelime testi ve özet istemleri (prompt'lar), konular |
| `js/lookup.js` | Canlı bilgi: hava durumu, haberler, Wikipedia, döviz |
| `js/media-keys.js` | Direksiyon / kulaklık medya tuşları |
| `js/commands.js` | Klasik moddaki sesli komutlar |
| `js/store.js` | Ayarlar, geçmiş ve kelime defteri (cihazda, localStorage) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Ana ekrana kurulabilir uygulama (PWA) |
| `serve.ps1` | Bilgisayarda test için yerel sunucu |

## Sonraki adım fikirleri

- Android uygulamasına sarmak: ekran kapalıyken çalışma.

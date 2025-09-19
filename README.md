# Kelime Oyunu 🎮

Türkçe Kelime Oyunu - Socket.io ile gerçek zamanlı çok oyunculu eğlence!

## 📋 Proje Açıklaması

Bu proje, klasik Türkçe kelime oyununu dijital ortama taşıyan, gerçek zamanlı çok oyunculu bir web uygulamasıdır. Oyuncular oda oluşturabilir, arkadaşlarını davet edebilir ve eğlenceli bir şekilde kelime bilgilerini test edebilirler.

## ✨ Özellikler

- **Gerçek Zamanlı Oyun**: Socket.io ile anlık iletişim
- **Oda Sistemi**: Özel odalar oluşturma ve katılma
- **Çoklu Kategori**: İsim, Hayvan, Bitki/Meyve/Sebze, Ülke/Şehir/İlçe, Eşya, Meslek
- **Zaman Sınırlaması**: Her tur için ayarlanabilir süre
- **Skor Sistemi**: Puanlama ve sıralama
- **İstatistikler**: Oyun geçmişi, kazanma oranı, en çok kullanılan kelimeler
- **Avatar Sistemi**: Kişiselleştirilebilir profil resimleri
- **Responsive Tasarım**: Mobil ve masaüstü uyumlu
- **Ses Efektleri**: Oyun deneyimini zenginleştiren sesler
- **Tema Sistemi**: Açık/Koyu/Void tema seçenekleri

## 🚀 Kurulum

### Gereksinimler

- Node.js (v14.0.0 veya üzeri)
- npm veya yarn

### Adımlar

1. **Projeyi Klonlayın**
   ```bash
   git clone https://github.com/gsahin96/kelime_oyunu.git
   cd kelime_oyunu
   ```

2. **Bağımlılıkları Yükleyin**
   ```bash
   npm install
   ```

3. **Sunucuyu Başlatın**
   ```bash
   npm start
   ```

4. **Tarayıcınızda Açın**
   
   http://localhost:3000 adresine gidin

## 🎯 Nasıl Oynanır

1. **Giriş Yapın**: Kullanıcı adınızı ve avatarınızı seçin
2. **Oda Oluşturun**: Yeni bir oyun odası oluşturun veya mevcut bir odaya katılın
3. **Oyunu Başlatın**: Oda sahibi olarak oyunu başlatın
4. **Kelime Söyleyin**: Rastgele seçilen harf ve kategoriye uygun kelimeyi zaman limitinde söyleyin
5. **Puan Kazanın**: Doğru kelime için puan alın, yanlış veya geç kalırsanız elenirsiniz
6. **Kazanın**: Son kalan oyuncu turu kazanır, hedef puana ulaşan genel kazanır

### Oyun Kuralları

- Her turda rastgele bir harf ve kategori seçilir
- Oyuncular sırayla kelime söylemelidir
- Kelime, verilen harfle başlamalı ve kategoriye uygun olmalıdır
- Daha önce söylenmiş kelimeler kullanılamaz
- Zaman dolduğunda veya yanlış kelime söylendiğinde oyuncu elenir
- Son kalan oyuncu turu kazanır

## 🛠️ Teknolojiler

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Real-time Communication**: Socket.io
- **Styling**: Tailwind CSS
- **Audio**: Tone.js
- **Icons**: Özel emoji sistemi

## 📁 Proje Yapısı

```
kelime_oyunu/
├── server.js              # Ana sunucu dosyası
├── index.html             # Ana oyun arayüzü
├── database.json          # Kelime veritabanı
├── package.json           # Proje bağımlılıkları
├── test_game_integration.js # Test dosyası
└── README.md             # Bu dosya
```

## 🤝 Katkıda Bulunma

1. Bu projeyi fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişikliklerinizi commit edin (`git commit -m 'Add amazing feature'`)
4. Branch'inizi push edin (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 👥 Geliştiriciler

- **Osman Karatay** - Geliştirici
- **Görkem Şahin** - Proje sahibi

---

**Not**: Bu proje eğitim amaçlı geliştirilmiştir ve aktif olarak geliştirilmektedir. Herhangi bir geri bildirim veya öneri için issue açmaktan çekinmeyin!

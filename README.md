# Kelime Oyunu

Kelime Oyunu artik tek klavye uzerinde paylasarak oynayabileceginiz yerel cok oyunculu bir kelime oyunudur.

## Ozellikler

- **Yerel cok oyuncu**: En fazla sekiz oyuncu isim girip sirayla oynayabilir.
- **Harf ve kategori secimi**: Her tur icin rastgele harf ve kategori.
- **Sure ve hedef puan kontrolu**: Tur suresini ve hedef puani panelden ayarlayin.
- **Tema secimi**: Void, Koyu veya Acik temalar arasinda gecis yapin.
- **Son kelimeler listesi**: Tur boyunca kullanilan kelimeleri takip edin.

## Baslarken

1. Depoyu bilgisayariniza alin veya mevcut klasoru yerel bir statik sunucuyla calistirin.
2. `index.html` dosyasini bir tarayici ile acin ya da `npx serve public` gibi bir aracla `/public` klasorunu yayinlayin.
3. Oyuncu ekraninda isimleri girin, oyuncu ekleyin veya silin.
4. "Oyuna Basla" ile oyun alanina gecin ve "Turu Baslat" butonu ile turu baslatin.

## Oynanis

- Sistem rasgele bir harf ve kategori secerek gosterir.
- Sira kimdeyse verilen harfle baslayan ve kategoriye uyan bir kelimeyi sure dolmadan yazmalidir.
- Kelime veritabaninda yoksa veya daha once kullanildiysa oyuncu elenir.
- Son kalan oyuncu turu kazanir ve hedef puana ulasana kadar yeni turlar otomatik baslar.

## Gelisim Ipuclari

- `public/js/game.js` oyun akisini yonetir.
- `database.json` kategori ve kelime listesini tutar; yeni kelimeler ekleyebilir veya kategorileri genisletebilirsiniz.
- `npm run embed-db` komutu `database.json` degistiginde `public/js/database.js` dosyasini gunceller.
- `public/css/styles.css` tema ve animasyonlari icerir; ihtiyaca gore stil ekleyebilirsiniz.

## Lisans

Bu proje MIT lisansi ile dagitilmistir.

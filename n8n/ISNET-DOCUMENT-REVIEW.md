# İşNet doküman incelemesi — 5 Kasım 2026

Kaynaklar: kullanıcının WebServis.rar ve Request Örnekler.rar dosyaları; e-Fatura/e-Arşiv arayüz dokümanları (12.08.2024) ve AddressBook dokümanı (10.01.2023).
RAR içerikleri veya örneklerdeki gerçek kişi/vergi bilgileri repoya kopyalanmadı.

## Doğrulanan sözleşme

- SendInvoice ve SendArchiveInvoice için XML namespace EInvoice.Service.Model.
- SOAP request ve model alanları alfabetik sırada üretilir.
- SendInvoice fatura numarasını sağlayıcıda oluşturur.
- Mükellef sorgusu GetTaxPayer; TaxPayerTaxCode boş bırakılmamalıdır (aksi halde bütün mükellefleri listeler).
- VKN/TCKN ve e-Fatura alıcı posta kutusu doğrulanmadan örnek/sahte değer atanmaz.
- Bazı gönderim örneklerinin satır ve genel tutarları uyumsuzdur; örnek tutarlar kullanılmaz.
- SOAPAction/WSDL sözleşmesi sunucudan alınamadı. Gönderim etkin değildir; yalnızca saf XML hazırlayıcı ve doğrulaması hazırdır.
- isnet-soap.cjs yalnızca test ortamına yönelik taslak XML üretir; ağ isteği yapmaz.

## Kullanıcı kararı

Tüm ürünler %1 KDV, satış tutarı KDV dahil.
Test taslaklarında matrah = round(toplam/1.01, 2); KDV = toplam-matrah.
1300.00 TL = 1287.13 TL matrah + 12.87 TL KDV. Eski faturalar güncellenmez.

## Gerçek sunucu testi

n8n execution 123777: internet çıkış IP kontrolü HTTP 200, IP 31.42.127.221.
InvoiceService WSDL erişimi başarısız; AddressBookService WSDL 10000ms timeout.
Bu bulgular sebebin kesin olarak IP izin listesi olduğunu kanıtlamaz. İşNet'in bu IP ve test servisleri için ağ/erişim kontrolü yapması gerekir.
Başarılı test faturası oluşturulmadı. Gönderim/kimliksiz alıcı kuralları, sağlayıcı erişimi ve WSDL doğrulaması tamamlanmadan etkinleştirilmemelidir.

## Kontroller

tests/isnet-soap.cjs: e-Fatura/e-Arşiv, XML kaçışları, sıralama, tutar yuvarlama ve uyuşmazlıklar, KDV/kimlik/posta kutusu eksikleri, test ortamı.
tests/gazi-fatura-vat.sql: gerçek service_role ile rollback testi; %1 KDV dahil hesap ve yanıt tutarları.

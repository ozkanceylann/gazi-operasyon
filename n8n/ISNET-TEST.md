# İşNet test hazırlığı

Workflow: GAZI_FATURA_ISNET_TEST (YD4Mcl6bbnh8crxZ), Özkan CEYLAN kişisel projesi.
Data Table: GAZI_ISNET_TEST_AYARLARI (eoWbljJNPuN3GG9K).

Tamamlanan Gazi siparişinin detayındaki Fatura kes düğmesi test panelini açar. Panelin test eylemi yönetici JWT'sini doğrular, gazi_faturalar test taslağını oluşturur/kullanır ve İşNet WSDL bağlantı sonucunu kaydeder. Test/canlı istemci isteğiyle değiştirilemez.

Bu sürüm fatura XML'i üretmez ve İşNet'e fatura göndermez. SOAP gönderim sözleşmesi, ürün satırları/fiyatları/KDV ve alıcı kimlik kuralları sağlayıcı dokümanlarıyla tamamlanmalıdır. Portal kullanıcı/şifresi SOAP kimlik doğrulaması değildir; SOAP için IP/VKN kullanılır. İlk gerçek n8n bağlantı testi 30 saniyede zaman aşımına uğradı.

PDF/XML dosya yolları ileride özel depolamaya bağlanacak. Taslak oluşturma ve probe RPC'leri yalnızca service_role tarafından çağrılır; aktör n8n /auth/v1/user kontrolünden gelir. Tarayıcı doğrudan fatura yazamaz. Akışın otomatik gönderim/zamanlayıcı tetikleyicisi yoktur.

Doğrulama: tests/order-invoices.cjs, tests/isnet-test-workflow.cjs, tests/gazi-fatura-test-rpc.sql (ROLLBACK).

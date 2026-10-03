# BoothPro Cloud Sync Foundation v1

Status: FOUNDATION / NOT PRODUCTION-CUTOVER
Base Kiosk: 29486c43a7405c9a073f74d0594bdc000b726dd9
Branch: feat/cloud-sync-foundation-2026-10-03

## Tujuan

Menjadikan Cloud sebagai source of truth untuk konfigurasi operasional BoothPro, sementara localStorage/IndexedDB hanya menjadi cache dan offline fallback.

Alur target:

Dashboard -> Supabase Auth -> Cloud Config -> Kiosk
Kiosk -> Supabase Auth -> Cloud Session/Storage -> Customer download

## Prinsip keamanan

- Publishable/anon key boleh berada di frontend; service-role/secret key tidak boleh.
- Semua tabel Cloud harus dilindungi Row Level Security (RLS).
- Konfigurasi booth dipisahkan berdasarkan workspace/booth identity.
- File pelanggan disimpan sebagai object storage, bukan blob di tabel database.
- Customer menerima signed/expiring download URL atau endpoint bundling; jangan expose bucket privat secara langsung.
- Penghapusan file menggunakan retention policy/cleanup job setelah status download dan masa retensi terpenuhi.
- localStorage tidak menjadi sumber data utama.
- Perubahan konfigurasi memakai revision/version + updated_at untuk conflict detection.

## Shared config

Kiosk terbaru sudah memiliki fondasi config yang luas: brand, packages, payment/QRIS, vouchers, theme, timer, camera, hardware, print, frame library/category/slots, cloud sync, cloudinary, footer, delivery/share settings dan feature flags.

Schema canonical berada di `docs/BOOTHPRO-CONFIG-SCHEMA-V1.json`.

## Tahap implementasi

1. Foundation: schema + cloud contract + identity (branch ini).
2. Config persistence: Dashboard write ke `boothpro_cloud_config`.
3. Kiosk pull/apply: boot + manual refresh + safe local fallback.
4. Frame metadata/storage: object storage + metadata table, tanpa localStorage sebagai source of truth.
5. Session manifest: metadata customer di database, file di object storage.
6. Download lifecycle: signed URL/bundle + status + retention/cleanup.
7. Dashboard observability: booth online, config revision, session/storage status.
8. QA cross-origin: Dashboard domain <-> Kiosk domain, offline fallback, auth/RLS, concurrency.

## Tidak dilakukan pada foundation

- Tidak mengubah UX/fitur capture, editor, print, soft file atau frame Kiosk.
- Tidak menghapus localStorage/IndexedDB sekarang.
- Tidak menggabungkan branch softfile-share-sync yang sebelumnya ditolak.
- Tidak menganggap BroadcastChannel sebagai sinkronisasi antar-domain.

## Definition of done untuk cutover

Cloud sync baru boleh disebut production baseline jika:
- Dashboard dan Kiosk membaca/menulis schema canonical yang sama.
- Perubahan Dashboard terbukti diterima Kiosk lintas domain/perangkat.
- Kiosk tetap berjalan ketika Cloud sementara tidak tersedia.
- RLS/auth diuji.
- Frame dan session files tidak bergantung pada browser storage.
- Download customer tercatat dan cleanup tidak terjadi sebelum lifecycle selesai.

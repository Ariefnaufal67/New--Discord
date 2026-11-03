# ⚡ Discord Serverless AI Bot (Vercel + Groq + Tavily)

Proyek Discord Bot modern berbasis **Discord HTTP Interactions API** (Slash Commands `/`) yang dirancang khusus untuk berjalan di atas platform serverless seperti **Vercel Serverless Functions**.

Berbeda dengan bot tradisional yang mengandalkan koneksi WebSocket persisten (Discord Gateway), bot ini **stateless** dan hanya terbangun saat ada request interaksi masuk dari Discord. Solusi ini 100% hemat biaya (dapat menggunakan paket gratis Vercel), tanpa perlu menyewa VPS atau server 24/7.

---

## 🚀 Fitur Utama & Tech Stack

- **Platform:** Vercel Serverless Functions (Node.js ES Modules).
- **Discord API:** Discord HTTP Interactions v10 (Verifikasi Ed25519 dengan `tweetnacl`).
- **AI Backend:** [Groq API](https://groq.com) (Ultra-fast LLM inference, OpenAI-compatible format):
  - **Model Teks:** `openai/gpt-oss-120b` (dapat disesuaikan via env `GROQ_TEXT_MODEL`).
  - **Model Vision (Baca Gambar):** `qwen/qwen3.6-27b` (dapat disesuaikan via env `GROQ_VISION_MODEL`).
- **Web Search:** [Tavily Search API](https://tavily.com) terintegrasi via function calling / tool-calling pada model teks untuk informasi *real-time* (berita terbaru, harga, cuaca, kurs, dll).
- **Reasoning Cleaner:** Otomatis menghapus blok internal `<think>...</think>` sebelum mengirim hasil ke Discord.
- **Auto Chunking:** Otomatis memecah pesan jika respons AI melebihi batas 2000 karakter Discord (menggunakan `@original` webhook dan *follow-up messages*).

---

## 📁 Struktur Direktori

```text
├── api/
│   └── interactions.js      # Endpoint serverless utama (/api/interactions) penerima webhook Discord
├── lib/
│   ├── discord.js           # Helper verifikasi Ed25519, REST API Discord, chunk pesan, & fetch chat
│   └── groq.js              # Logika AI Groq (Chat, Vision, Tavily tool-calling, & perangkum aktivitas)
├── register-commands.js     # Script registrasi slash command global ke Discord API
├── package.json             # Konfigurasi dependensi Node.js ("type": "module")
├── vercel.json              # Konfigurasi Vercel (maxDuration 60 detik)
├── .env.example             # Template environment variables
├── .gitignore               # Daftar file yang diabaikan Git
└── README.md                # Dokumentasi lengkap proyek
```

---

## 📋 Slash Command yang Tersedia

| Command | Parameter | Deskripsi |
| :--- | :--- | :--- |
| `/tanya` | `pertanyaan` (string, wajib)<br>`gambar` (attachment, opsional) | Tanya apa saja ke AI. Jika menyertakan gambar, bot memakai model vision `qwen/qwen3.6-27b`. Jika teks saja, bot memakai `openai/gpt-oss-120b` dengan kemampuan web search via Tavily jika butuh data *real-time*. |
| `/activity` | `user` (user, wajib)<br>`hari` (integer, opsional, default: 7) | Memindai pesan teks seorang user di server dalam rentang hari tertentu via REST API dan merangkum topik pembicaraannya menggunakan AI. |
| `/help` | *(tidak ada)* | Menampilkan panduan command dan penjelasan mengenai arsitektur bot. |

---

## 🛠️ Langkah 1: Persiapan di Discord Developer Portal

1. Buka [Discord Developer Portal](https://discord.com/developers/applications) dan login dengan akun Discord Anda.
2. Klik tombol **New Application**, beri nama aplikasi Anda (misalnya `AI Serverless Bot`), lalu klik **Create**.
3. Di tab **General Information**:
   - Salin **APPLICATION ID** (ini adalah `DISCORD_APPLICATION_ID`).
   - Salin **PUBLIC KEY** (ini adalah `DISCORD_PUBLIC_KEY`).
4. Pindah ke tab **Bot** (di menu sebelah kiri):
   - Klik **Reset Token** untuk membuat token baru, lalu salin token tersebut (ini adalah `DISCORD_TOKEN`).
   - *Penting:* Pada bagian **Privileged Gateway Intents**, Anda **TIDAK PERLU** menyalakan Message Content Intent untuk command dasar, namun jika ingin command `/activity` membaca riwayat pesan di server secara maksimal, pastikan bot diberi izin role yang memadai di server Anda.
5. Biarkan tab Discord Developer Portal tetap terbuka, kita akan kembali lagi setelah deploy ke Vercel.

---

## 🔑 Langkah 2: Dapatkan API Key Groq & Tavily

1. **Groq API Key:**
   - Kunjungi [Groq Console](https://console.groq.com/keys).
   - Buat akun gratis dan klik **Create API Key**.
   - Salin kunci tersebut (ini adalah `GROQ_API_KEY`).
2. **Tavily API Key:**
   - Kunjungi [Tavily AI](https://tavily.com/).
   - Daftar akun dan salin API Key dari dashboard (ini adalah `TAVILY_API_KEY`).

---

## 💻 Langkah 3: Setup Lokal & Daftarkan Slash Command

1. Clone atau siapkan direktori project ini di komputer Anda:
   ```bash
   cd discord-serverless-bot
   npm install
   ```

2. Buat file `.env` dari template `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Isi file `.env` dengan kredensial yang sudah didapatkan:
   ```env
   DISCORD_TOKEN=bot_token_dari_discord
   DISCORD_PUBLIC_KEY=public_key_dari_discord
   DISCORD_APPLICATION_ID=application_id_dari_discord
   GROQ_API_KEY=gsk_...
   TAVILY_API_KEY=tvly-...
   ```

4. Jalankan script pendaftaran slash command ke Discord:
   ```bash
   npm run register
   # atau: node register-commands.js
   ```
   Jika berhasil, terminal akan menampilkan konfirmasi bahwa command `/tanya`, `/activity`, dan `/help` telah terdaftar secara global.

---

## ☁️ Langkah 4: Deploy ke Vercel

Anda dapat men-deploy ke Vercel menggunakan **Vercel Dashboard (GitHub)** atau **Vercel CLI**.

### Opsi A: Lewat Vercel Dashboard (Direkomendasikan)
1. Push repository Anda ke GitHub / GitLab.
2. Buka [Vercel Dashboard](https://vercel.com/dashboard) dan klik **Add New...** -> **Project**.
3. Import repository project Anda.
4. Di bagian **Environment Variables**, tambahkan kelima variabel berikut:
   - `DISCORD_TOKEN`
   - `DISCORD_PUBLIC_KEY`
   - `DISCORD_APPLICATION_ID`
   - `GROQ_API_KEY`
   - `TAVILY_API_KEY`
5. Klik **Deploy**. Tunggu hingga proses deployment selesai dan Anda mendapatkan domain produksi, misalnya `https://discord-ai-bot.vercel.app`.

### Opsi B: Lewat Vercel CLI
1. Install Vercel CLI jika belum ada: `npm i -g vercel`
2. Jalankan perintah deploy:
   ```bash
   vercel
   ```
3. Set environment variables di Vercel:
   ```bash
   vercel env add DISCORD_TOKEN
   vercel env add DISCORD_PUBLIC_KEY
   vercel env add DISCORD_APPLICATION_ID
   vercel env add GROQ_API_KEY
   vercel env add TAVILY_API_KEY
   ```
4. Deploy ke environment produksi:
   ```bash
   vercel --prod
   ```

---

## 🔗 Langkah 5: Set Interactions Endpoint URL di Discord

> [!IMPORTANT]
> Discord akan langsung mengirimkan HTTP request bertipe **PING (Type 1)** ke endpoint Anda begitu URL disimpan. Oleh karena itu, function di Vercel harus sudah berstatus **LIVE** dan environment variable `DISCORD_PUBLIC_KEY` harus sudah terpasang dengan benar di Vercel, jika tidak Discord akan menampilkan error *"The specified interaction endpoint url could not be verified"*.

1. Buka kembali [Discord Developer Portal](https://discord.com/developers/applications) -> Pilih aplikasi Anda -> Masuk ke tab **General Information**.
2. Cari field **INTERACTIONS ENDPOINT URL**.
3. Masukkan URL endpoint Vercel Anda dengan format:
   ```text
   https://<nama-project-anda>.vercel.app/api/interactions
   ```
4. Klik **Save Changes**.
5. Jika verifikasi PING berhasil, Discord akan menampilkan notifikasi hijau *"All changes saved"*.

---

## 🤖 Langkah 6: Invite Bot ke Server Discord

1. Di Discord Developer Portal, buka tab **OAuth2** -> **URL Generator**.
2. Pada bagian **Scopes**, centang:
   - `bot`
   - `applications.commands` *(Wajib agar slash command muncul di server)*
3. Pada bagian **Bot Permissions**, centang:
   - `Send Messages`
   - `View Channels`
   - `Read Message History` *(Dibutuhkan untuk command `/activity`)*
   - `Attach Files`
4. Salin tautan URL yang ter-generate di bagian bawah layar.
5. Buka tautan tersebut di browser, pilih server Discord tujuan Anda, lalu klik **Authorize**.

---

## 🧪 Menguji Bot di Discord

1. **Uji `/help`**:
   Ketik `/help` di channel teks. Bot akan langsung menampilkan panduan penggunaan dan penjelasan arsitektur.
2. **Uji `/tanya` (Teks Biasa & Web Search)**:
   - Tanya umum: `/tanya pertanyaan: Jelaskan konsep relativitas einstein secara ringkas`
   - Tanya data real-time: `/tanya pertanyaan: Berapa harga bitcoin hari ini dan bagaimana berita terbarunya?` *(Bot akan otomatis menggunakan Tavily Search)*
3. **Uji `/tanya` (Analisis Gambar)**:
   - Ketik `/tanya`, masukkan pertanyaan, lalu pada opsi opsional `gambar`, upload gambar (diagram, foto, screenshot kode). AI Vision akan menganalisis isi gambar tersebut.
4. **Uji `/activity`**:
   - Ketik `/activity user:@teman hari:7`
   - Bot akan memindai pesan yang dikirim oleh user tersebut di channel server lalu merangkum topik pembicaraannya.

---

## ❓ Mengapa Bot Ini Tidak Bisa @mention atau Prefix Command (`!ask`)?

Banyak pengguna terbiasa dengan bot model lama yang bisa merespons saat di-mention (`@bot halo`) atau dipanggil dengan prefix (`!ask`). Mengapa bot ini tidak bisa demikian?

1. **Arsitektur Discord Gateway (WebSocket persisten):**
   Bot tradisional harus membuka koneksi socket TCP/WebSocket terus-menerus 24 jam tanpa putus ke server Discord (`gateway.discord.gg`).
2. **Karakteristik Serverless:**
   Serverless Function (seperti Vercel) dirancang hanya hidup selama beberapa detik saat menerima request HTTP, lalu langsung nonaktif (mati/beku) untuk menghemat sumber daya. Serverless **tidak bisa** menahan koneksi WebSocket persisten.
3. **Solusi Discord HTTP Interactions:**
   Discord menyediakan sistem webhook HTTP di mana setiap kali ada user yang mengetik Slash Command (`/`), server Discord yang akan mengirimkan HTTP POST ke endpoint Vercel kita. Discord **tidak** mengirimkan HTTP webhook untuk pesan teks biasa atau mention kecuali melalui Slash Command.
4. **Kesimpulan:**
   Ini **bukan bug**, melainkan karakteristik desain arsitektur serverless. Kelebihannya adalah bot Anda bebas biaya server 24/7, tidak akan pernah crash akibat connection drop WebSocket, dan otomatis scaling tanpa maintenance.

---

## 🩺 Panduan Troubleshooting

| Gejala Masalah | Penyebab Umum | Solusi |
| :--- | :--- | :--- |
| **"The specified interaction endpoint url could not be verified"** saat isi URL di Developer Portal | 1. URL belum live di Vercel.<br>2. `DISCORD_PUBLIC_KEY` di env Vercel salah.<br>3. Body parser aktif atau path salah. | Pastikan deploy Vercel sudah sukses (`Ready`). Cek `DISCORD_PUBLIC_KEY` di Vercel settings sudah sesuai dengan di Discord Portal (bukan Client Secret). Pastikan URL berakhiran `/api/interactions`. |
| **Invalid request signature (HTTP 401)** di log Vercel | Request dikirim tanpa signature Ed25519 yang valid atau Public Key tidak cocok. | Periksa kembali `DISCORD_PUBLIC_KEY`. Jangan sampai ada spasi tambahan saat copy-paste ke environment variables. |
| **Slash command tidak muncul di Discord** | Script registrasi belum dijalankan atau bot diundang tanpa scope `applications.commands`. | 1. Jalankan `node register-commands.js`.<br>2. Pastikan saat invite bot, scope `applications.commands` dicentang.<br>3. Restart client Discord (Ctrl+R) jika command baru saja didaftarkan. |
| **"The application did not respond" (Timeout 3 detik)** | Bot tidak merespons Discord dalam batas 3 detik. | Pastikan `interactions.js` segera membalas dengan `{ type: 5 }` (Deferred) sebelum memproses AI. Kode di repo ini sudah menggunakan pola deferred otomatis. |
| **Function Vercel timeout / terputus di tengah jalan** | Default timeout Vercel Hobby adalah 10-15 detik, sedangkan pemanggilan AI + web search bisa lebih lama. | File `vercel.json` di repo ini sudah diset `maxDuration: 60`. Pastikan file `vercel.json` ikut ter-deploy. |
| **Command `/activity` melaporkan 0 pesan** | Bot tidak memiliki izin `View Channel` atau `Read Message History` di channel-channel server, atau user tidak aktif di rentang hari tersebut. | Berikan role pada bot yang memiliki permission `Read Message History` pada channel teks target. |

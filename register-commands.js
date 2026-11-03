import 'dotenv/config';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

if (!DISCORD_TOKEN || !DISCORD_APPLICATION_ID) {
  console.error('\n❌ ERROR: DISCORD_TOKEN atau DISCORD_APPLICATION_ID belum diset di file .env!');
  console.error('Pastikan kamu sudah membuat file .env dan mengisinya dengan kredensial dari Discord Developer Portal.\n');
  process.exit(1);
}

const commands = [
  {
    name: 'tanya',
    description: 'Tanya apa saja ke AI (mendukung teks, analisis gambar, dan pencarian web real-time)',
    options: [
      {
        name: 'pertanyaan',
        description: 'Pertanyaan atau instruksi untuk AI',
        type: 3, // STRING
        required: true,
      },
      {
        name: 'gambar',
        description: 'Lampiran gambar untuk dianalisis oleh AI Vision',
        type: 11, // ATTACHMENT
        required: false,
      },
    ],
  },
  {
    name: 'activity',
    description: 'Rangkum aktivitas chat seorang user di server dalam rentang hari tertentu',
    options: [
      {
        name: 'user',
        description: 'Target user yang ingin dicek aktivitasnya',
        type: 6, // USER
        required: true,
      },
      {
        name: 'hari',
        description: 'Rentang hari ke belakang untuk dianalisis (default: 7, min: 1, max: 30)',
        type: 4, // INTEGER
        required: false,
        min_value: 1,
        max_value: 30,
      },
    ],
  },
  {
    name: 'help',
    description: 'Panduan penggunaan bot dan daftar slash command yang tersedia',
  },
];

async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`;

  console.log(`\n🚀 Mendaftarkan ${commands.length} slash command ke Discord...`);
  console.log(`📌 Application ID: ${DISCORD_APPLICATION_ID}`);
  console.log(`🌐 Endpoint: ${url}\n`);

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error(`❌ Gagal mendaftarkan command [HTTP ${res.status}]:\n`, errorData);
      if (res.status === 401) {
        console.error('💡 Petunjuk: DISCORD_TOKEN kamu kemungkinan salah atau kedaluwarsa.');
      } else if (res.status === 403) {
        console.error('💡 Petunjuk: Pastikan bot memiliki scope `applications.commands` dan permissions yang memadai.');
      }
      process.exit(1);
    }

    const data = await res.json();
    console.log('✅ Berhasil mendaftarkan slash command secara global!\n');
    console.log('Daftar command terdaftar:');
    for (const cmd of data) {
      console.log(` - /${cmd.name}: ${cmd.description} (ID: ${cmd.id})`);
    }
    console.log('\n💡 Catatan: Perubahan command global di Discord biasanya langsung aktif atau membutuhkan waktu beberapa menit untuk sinkronisasi di semua server/klien Discord.');
  } catch (error) {
    console.error('❌ Terjadi kesalahan koneksi saat menghubungi Discord API:', error.message);
    process.exit(1);
  }
}

registerCommands();

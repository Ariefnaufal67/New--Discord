import {
  verifyDiscordSignature,
  sendChunkedResponse,
  fetchUserMessagesAcrossGuild,
} from '../lib/discord.js';
import {
  askGroqText,
  askGroqVision,
  summarizeUserActivity,
} from '../lib/groq.js';

// Matikan body parser bawaan Vercel agar kita mendapatkan raw stream
// untuk keperluan verifikasi cryptographic signature Ed25519
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Helper untuk membaca raw body buffer dari request stream Node.js.
 */
async function getRawBody(req) {
  if (req.rawBody) {
    return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  }
  if (req.body && Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Memproses logika slash command di background setelah status deferred dikirim.
 */
async function handleSlashCommand(interaction) {
  const applicationId = interaction.application_id || process.env.DISCORD_APPLICATION_ID;
  const token = interaction.token;
  const commandName = interaction.data?.name;
  const options = interaction.data?.options || [];

  try {
    if (commandName === 'tanya') {
      const question = options.find((opt) => opt.name === 'pertanyaan')?.value;
      const gambarOption = options.find((opt) => opt.name === 'gambar');

      // Cek apakah ada attachment gambar
      if (gambarOption && gambarOption.value) {
        const attachmentId = gambarOption.value;
        const attachment = interaction.data?.resolved?.attachments?.[attachmentId];

        if (!attachment || !attachment.url) {
          await sendChunkedResponse(
            applicationId,
            token,
            '⚠️ Gambar yang dilampirkan tidak valid atau gagal diproses oleh Discord.'
          );
          return;
        }

        // Jalankan model vision
        const visionReply = await askGroqVision(question, attachment.url, process.env);
        await sendChunkedResponse(
          applicationId,
          token,
          `🖼️ **Pertanyaan:** ${question}\n\n${visionReply}`
        );
      } else {
        // Model teks dengan tool-calling Tavily
        const textReply = await askGroqText(question, process.env);
        await sendChunkedResponse(
          applicationId,
          token,
          `💬 **Pertanyaan:** ${question}\n\n${textReply}`
        );
      }
      return;
    }

    if (commandName === 'activity') {
      const guildId = interaction.guild_id;
      if (!guildId) {
        await sendChunkedResponse(
          applicationId,
          token,
          '⚠️ Command `/activity` hanya dapat dijalankan di dalam server (guild), bukan di Direct Message (DM).'
        );
        return;
      }

      const targetUserId = options.find((opt) => opt.name === 'user')?.value;
      const days = Math.min(Math.max(options.find((opt) => opt.name === 'hari')?.value || 7, 1), 30);

      const resolvedUser = interaction.data?.resolved?.users?.[targetUserId];
      const targetTag = resolvedUser
        ? (resolvedUser.global_name || resolvedUser.username)
        : `<@${targetUserId}>`;

      // Ambil riwayat chat via Discord REST API
      const { messages, scannedChannelsCount } = await fetchUserMessagesAcrossGuild(
        guildId,
        process.env.DISCORD_TOKEN,
        targetUserId,
        days
      );

      if (messages.length === 0) {
        await sendChunkedResponse(
          applicationId,
          token,
          `🔍 **Aktivitas Chat: ${targetTag}** (${days} hari terakhir)\n\nTidak ditemukan pesan teks dari user tersebut di ${scannedChannelsCount} channel yang berhasil dipindai oleh bot.`
        );
        return;
      }

      // Rangkum pesan dengan Groq AI
      const summary = await summarizeUserActivity(targetTag, messages, days, process.env);

      const finalResponse = `📊 **Ringkasan Aktivitas Chat: ${targetTag}**\n` +
        `🗓️ **Rentang Waktu:** ${days} hari terakhir | **Pesan Ditemukan:** ${messages.length} pesan di ${scannedChannelsCount} channel\n\n` +
        `${summary}\n\n` +
        `*Catatan: Bot serverless membaca hingga ~100 pesan terbaru per channel teks yang memiliki izin akses.*`;

      await sendChunkedResponse(applicationId, token, finalResponse);
      return;
    }

    if (commandName === 'help') {
      const helpText = `👋 **Halo! Selamat datang di Discord Bot Serverless AI.**\n\n` +
        `Bot ini dirancang dengan arsitektur modern **Discord HTTP Interactions API** yang berjalan di atas **Vercel Serverless Functions**, bertenaga AI dari **Groq** dan pencarian web real-time dari **Tavily**.\n\n` +
        `📌 **Daftar Slash Command yang Tersedia:**\n` +
        `• \`/tanya pertanyaan:<teks> [gambar:<lampiran>]\`\n` +
        `  Bertanya apa saja ke AI! Jika melampirkan gambar, AI Vision (\`qwen/qwen3.6-27b\`) akan menganalisis gambarnya. Jika hanya teks, model (\`openai/gpt-oss-120b\`) akan menjawab dengan dukungan pencarian web real-time untuk data terkini.\n\n` +
        `• \`/activity user:<@user> [hari:<1-30>]\`\n` +
        `  Menganalisis dan merangkum topik obrolan seorang user di berbagai channel server dalam rentang hari tertentu (default: 7 hari).\n\n` +
        `• \`/help\`\n` +
        `  Menampilkan menu bantuan dan informasi teknis ini.\n\n` +
        `⚠️ **Karakteristik & Batasan Serverless:**\n` +
        `1. **Stateless (Tanpa Memori Antar-Request):** Bot tidak mengingat percakapan sebelumnya. Setiap pemanggilan command berdiri sendiri.\n` +
        `2. **Hanya Slash Command (/):** Bot ini TIDAK mendengarkan mention (@bot) atau prefix command (seperti \`!ask\`). Ini bukan bug, melainkan arsitektur HTTP Interactions tanpa koneksi WebSocket Gateway yang persisten.`;

      await sendChunkedResponse(applicationId, token, helpText);
      return;
    }

    // Command tidak dikenal
    await sendChunkedResponse(
      applicationId,
      token,
      `❓ Command \`/${commandName}\` tidak dikenali oleh bot.`
    );
  } catch (error) {
    console.error(`Error saat mengeksekusi slash command /${commandName}:`, error);
    try {
      await sendChunkedResponse(
        applicationId,
        token,
        `⚠️ **Terjadi Kesalahan saat memproses permintaan:**\n\`\`\`\n${error.message || 'Internal Server Error'}\n\`\`\``
      );
    } catch (sendErr) {
      console.error('Gagal mengirim pesan error ke Discord webhook:', sendErr);
    }
  }
}

/**
 * Handler utama Vercel Serverless Function untuk /api/interactions
 */
export default async function handler(req, res) {
  // Hanya terima method POST dari Discord
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).send('Method Not Allowed');
    return;
  }

  // 1. Ambil raw body untuk verifikasi Ed25519
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (bodyError) {
    console.error('Gagal membaca body request:', bodyError);
    res.status(400).send('Bad Request: Unable to read request body');
    return;
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  // 2. Verifikasi cryptographic signature dari Discord
  const isVerified = verifyDiscordSignature(rawBody, signature, timestamp, publicKey);
  if (!isVerified) {
    console.warn('Verifikasi signature Discord gagal: Invalid signature.');
    res.status(401).send('Invalid request signature');
    return;
  }

  // 3. Parse JSON interaction payload
  let interaction;
  try {
    interaction = JSON.parse(rawBody.toString('utf-8'));
  } catch (parseError) {
    console.error('Gagal parse interaction payload JSON:', parseError);
    res.status(400).send('Bad Request: Invalid JSON');
    return;
  }

  // 4. Tangani PING (Type 1) - Verifikasi Endpoint Developer Portal
  if (interaction.type === 1) {
    res.status(200).json({ type: 1 }); // Balas PONG
    return;
  }

  // 5. Tangani APPLICATION_COMMAND (Type 2) - Slash Command
  if (interaction.type === 2) {
    // Balas langsung dengan type: 5 (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE)
    // Discord mewajibkan acknowledgement dalam waktu 3 detik
    res.status(200).json({ type: 5 });

    // Lanjutkan pemrosesan AI di background dan kirim hasil via webhook
    await handleSlashCommand(interaction);
    return;
  }

  // Default fallback untuk interaction type lainnya
  res.status(400).json({ error: 'Unknown interaction type' });
}

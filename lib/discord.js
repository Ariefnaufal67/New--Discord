import nacl from 'tweetnacl';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

/**
 * Memverifikasi signature request Ed25519 yang dikirim oleh Discord.
 * Wajib menggunakan raw body request (Buffer atau string asli sebelum diparse).
 *
 * @param {Buffer|string} rawBody - Raw body buffer/string dari request
 * @param {string} signature - Header X-Signature-Ed25519
 * @param {string} timestamp - Header X-Signature-Timestamp
 * @param {string} clientPublicKey - DISCORD_PUBLIC_KEY dari Developer Portal
 * @returns {boolean} - true jika signature valid
 */
export function verifyDiscordSignature(rawBody, signature, timestamp, clientPublicKey) {
  if (!rawBody || !signature || !timestamp || !clientPublicKey) {
    return false;
  }

  try {
    const timestampBuffer = Buffer.from(timestamp, 'utf-8');
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf-8');
    const messageBuffer = Buffer.concat([timestampBuffer, bodyBuffer]);

    const signatureBuffer = Buffer.from(signature, 'hex');
    const publicKeyBuffer = Buffer.from(clientPublicKey, 'hex');

    return nacl.sign.detached.verify(messageBuffer, signatureBuffer, publicKeyBuffer);
  } catch (error) {
    console.error('Error saat verifikasi signature Discord:', error);
    return false;
  }
}

/**
 * Memecah teks panjang menjadi beberapa bagian agar tidak melebihi batas 2000 karakter Discord.
 * Memotong dengan cerdas pada paragraph break, newline, atau spasi jika memungkinkan.
 *
 * @param {string} text - Teks yang akan dipecah
 * @param {number} maxLength - Batas maksimum per pesan (default 2000)
 * @returns {string[]} - Array string potongan pesan
 */
export function splitMessage(text, maxLength = 2000) {
  if (!text) return [''];
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = -1;

    // Prioritaskan potong di akhir paragraf (\n\n)
    const doubleNewline = remaining.lastIndexOf('\n\n', maxLength);
    if (doubleNewline > maxLength * 0.4) {
      splitIndex = doubleNewline + 2;
    }

    // Jika tidak ada, potong di baris baru (\n)
    if (splitIndex === -1) {
      const singleNewline = remaining.lastIndexOf('\n', maxLength);
      if (singleNewline > maxLength * 0.4) {
        splitIndex = singleNewline + 1;
      }
    }

    // Jika tidak ada, potong di spasi terakhir
    if (splitIndex === -1) {
      const space = remaining.lastIndexOf(' ', maxLength);
      if (space > maxLength * 0.4) {
        splitIndex = space + 1;
      }
    }

    // Fallback: potong paksa tepat di maxLength
    if (splitIndex === -1) {
      splitIndex = maxLength;
    }

    const chunk = remaining.slice(0, splitIndex).trimEnd();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks.length > 0 ? chunks : [''];
}

/**
 * Mengedit respons awal (@original) yang sebelumnya sudah di-defer (type: 5).
 *
 * @param {string} applicationId - DISCORD_APPLICATION_ID
 * @param {string} token - interaction.token
 * @param {object|string} payload - Konten pesan atau object payload Discord
 */
export async function editOriginalResponse(applicationId, token, payload) {
  const url = `${DISCORD_API_BASE}/webhooks/${applicationId}/${token}/messages/@original`;
  const body = typeof payload === 'string' ? { content: payload } : payload;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gagal mengedit respons original (@original) [${res.status}]: ${errorText}`);
  }

  return await res.json();
}

/**
 * Mengirim pesan follow-up setelah respons original berhasil di-edit.
 * Digunakan saat output teks AI melebihi 2000 karakter.
 *
 * @param {string} applicationId - DISCORD_APPLICATION_ID
 * @param {string} token - interaction.token
 * @param {object|string} payload - Konten pesan atau object payload Discord
 */
export async function sendFollowupResponse(applicationId, token, payload) {
  const url = `${DISCORD_API_BASE}/webhooks/${applicationId}/${token}`;
  const body = typeof payload === 'string' ? { content: payload } : payload;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gagal mengirim follow-up response [${res.status}]: ${errorText}`);
  }

  return await res.json();
}

/**
 * Mengirim seluruh teks ke Discord, otomatis memecah jika > 2000 karakter.
 * Potongan pertama mengedit @original, sisa potongan dikirim via follow-up webhook.
 *
 * @param {string} applicationId - DISCORD_APPLICATION_ID
 * @param {string} token - interaction.token
 * @param {string} fullText - Teks lengkap balasan
 */
export async function sendChunkedResponse(applicationId, token, fullText) {
  const chunks = splitMessage(fullText, 2000);
  const safeChunks = chunks.length > 0 ? chunks : ['*(Respons kosong)*'];

  // Update pesan awal (@original)
  await editOriginalResponse(applicationId, token, { content: safeChunks[0] });

  // Kirim sisa potongan sebagai pesan tambahan
  for (let i = 1; i < safeChunks.length; i++) {
    await sendFollowupResponse(applicationId, token, { content: safeChunks[i] });
  }
}

/**
 * Mengambil daftar channel dalam sebuah guild / server.
 *
 * @param {string} guildId - ID server Discord
 * @param {string} botToken - DISCORD_TOKEN
 */
export async function getGuildChannels(guildId, botToken) {
  const url = `${DISCORD_API_BASE}/guilds/${guildId}/channels`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gagal mengambil channel guild [${res.status}]: ${errorText}`);
  }

  return await res.json();
}

/**
 * Mengambil hingga 100 pesan terakhir dari sebuah channel teks.
 *
 * @param {string} channelId - ID channel Discord
 * @param {string} botToken - DISCORD_TOKEN
 * @param {number} limit - Jumlah maksimal pesan (maksimal 100 per Discord API)
 */
export async function getChannelMessages(channelId, botToken, limit = 100) {
  const url = `${DISCORD_API_BASE}/channels/${channelId}/messages?limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });

  if (!res.ok) {
    // 403 Forbidden berarti bot tidak memiliki izin read message history di channel ini
    if (res.status === 403) {
      return [];
    }
    const errorText = await res.text();
    console.warn(`Peringatan: Gagal membaca pesan dari channel ${channelId} [${res.status}]: ${errorText}`);
    return [];
  }

  return await res.json();
}

/**
 * Mengambil riwayat pesan user target di berbagai channel teks dalam server
 * dalam rentang hari tertentu (dibatasi demi batas serverless ~60 detik).
 *
 * @param {string} guildId - ID server Discord
 * @param {string} botToken - DISCORD_TOKEN
 * @param {string} targetUserId - ID user yang dicek
 * @param {number} days - Rentang hari ke belakang
 * @returns {Promise<{ messages: Array, scannedChannelsCount: number }>}
 */
export async function fetchUserMessagesAcrossGuild(guildId, botToken, targetUserId, days = 7) {
  const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  const channels = await getGuildChannels(guildId, botToken);

  // Filter hanya text channels (0 = GUILD_TEXT, 5 = GUILD_ANNOUNCEMENT)
  const textChannels = channels.filter(c => c.type === 0 || c.type === 5);

  // Batasi pemindaian hingga 12 channel teks teratas demi batas waktu serverless Vercel (60 detik)
  const channelsToScan = textChannels.slice(0, 12);

  const channelPromises = channelsToScan.map(async (channel) => {
    try {
      const messages = await getChannelMessages(channel.id, botToken, 100);
      const userMsgs = [];

      for (const msg of messages) {
        const msgTime = new Date(msg.timestamp).getTime();
        // Lewati pesan yang lebih lama dari cutoff
        if (msgTime < cutoffTime) continue;

        if (msg.author?.id === targetUserId && msg.content && msg.content.trim().length > 0) {
          userMsgs.push({
            channelName: channel.name,
            content: msg.content.trim(),
            timestamp: msg.timestamp,
          });
        }
      }

      return userMsgs;
    } catch (err) {
      console.warn(`Gagal memindai channel #${channel.name}:`, err.message);
      return [];
    }
  });

  const results = await Promise.allSettled(channelPromises);
  const allUserMessages = [];

  for (const result of results) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      allUserMessages.push(...result.value);
    }
  }

  // Urutkan pesan dari yang terlama ke yang terbaru
  allUserMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    messages: allUserMessages,
    scannedChannelsCount: channelsToScan.length,
  };
}

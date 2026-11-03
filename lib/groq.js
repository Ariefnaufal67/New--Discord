const GROQ_API_BASE = 'https://api.groq.com/openai/v1/chat/completions';
const TAVILY_API_BASE = 'https://api.tavily.com/search';

const DEFAULT_TEXT_MODEL = process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b';
const DEFAULT_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';

/**
 * System prompt dasar untuk bot Discord AI.
 * Menegaskan sifat bot yang stateless dan format respons yang bersih.
 */
const SYSTEM_PROMPT = `Kamu adalah asisten AI cerdas dan ramah di server Discord.
PENTING TENTANG STATUS:
- Bot ini berjalan di arsitektur serverless yang bersifat STATELESS.
- Kamu TIDAK memiliki akses ke riwayat percakapan sebelumnya; setiap interaksi/pertanyaan berdiri sendiri secara mandiri.
- Jangan berasumsi mengetahui konteks obrolan masa lalu kecuali jika user menyediakannya secara langsung di pertanyaan.

PANDUAN FORMAT & GAYA BAHASA:
- Berikan jawaban secara langsung, jelas, padat, dan natural dalam bahasa Indonesia (atau sesuai bahasa pertanyaan pengguna).
- HINDARI membungkus seluruh jawaban ke dalam blok kode (\`\`\`), KECUALI jika pengguna secara eksplisit meminta kode program.
- Jika menyebutkan kode singkat, gunakan inline code (\`seperti ini\`).
- Gunakan formatting markdown Discord secara efektif (bullet points, bold) agar mudah dibaca di layar HP maupun desktop.
- Kamu memiliki akses ke tool web search jika memerlukan data real-time terkini (berita terbaru, harga saham/kripto, cuaca, kurs mata uang, rilisan teknologi terbaru, dsb).`;

/**
 * Membersihkan output AI dari tag internal seperti <think>...</think>
 * yang sering muncul pada model reasoning/vision.
 *
 * @param {string} text - Teks mentah dari AI
 * @returns {string} - Teks bersih siap kirim ke Discord
 */
export function cleanAIResponse(text) {
  if (!text) return '';
  // Hapus blok <think>...</think> lengkap
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Hapus sisa tag pembuka <think> jika output terpotong
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');
  return cleaned.trim();
}

/**
 * Melakukan pencarian web menggunakan Tavily Search API.
 *
 * @param {string} query - Kata kunci pencarian
 * @param {string} apiKey - TAVILY_API_KEY
 * @returns {Promise<object>} - Ringkasan dan hasil pencarian
 */
async function searchWithTavily(query, apiKey) {
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY belum dikonfigurasi pada environment variable.');
  }

  const res = await fetch(TAVILY_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: query,
      search_depth: 'basic',
      include_answer: true,
      max_results: 5,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Tavily search gagal [${res.status}]: ${errorText}`);
  }

  const data = await res.json();

  return {
    query,
    answer: data.answer || null,
    results: (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    })),
  };
}

/**
 * Menjawab pertanyaan teks menggunakan Groq Text Model dengan kemampuan Tool-Calling Tavily.
 *
 * @param {string} question - Pertanyaan dari user
 * @param {object} env - Environment variables ({ GROQ_API_KEY, TAVILY_API_KEY })
 * @returns {Promise<string>} - Jawaban akhir AI
 */
export async function askGroqText(question, env = process.env) {
  const groqApiKey = env.GROQ_API_KEY;
  const tavilyApiKey = env.TAVILY_API_KEY;

  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY belum dikonfigurasi.');
  }

  const model = env.GROQ_TEXT_MODEL || DEFAULT_TEXT_MODEL;

  const tools = [
    {
      type: 'function',
      function: {
        name: 'tavily_search',
        description: 'Mencari informasi real-time dan data terkini di web menggunakan Tavily API. Gunakan ini untuk berita terkini, harga barang/kurs/kripto terbaru, event mutakhir, atau fakta yang memerlukan konfirmasi waktu nyata.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Kata kunci pencarian spesifik untuk mesin pencari web',
            },
          },
          required: ['query'],
        },
      },
    },
  ];

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: question },
  ];

  // Request awal ke Groq
  const initialPayload = {
    model: model,
    messages: messages,
    temperature: 0.7,
  };

  // Hanya sertakan tools jika TAVILY_API_KEY tersedia
  if (tavilyApiKey) {
    initialPayload.tools = tools;
    initialPayload.tool_choice = 'auto';
  }

  const initialRes = await fetch(GROQ_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(initialPayload),
  });

  if (!initialRes.ok) {
    const errorText = await initialRes.text();
    throw new Error(`Groq API text error [${initialRes.status}]: ${errorText}`);
  }

  const initialData = await initialRes.json();
  const choice = initialData.choices?.[0];

  if (!choice) {
    throw new Error('Groq API tidak mengembalikan pilihan jawaban.');
  }

  const responseMessage = choice.message;

  // Cek apakah model meminta eksekusi tool (tavily_search)
  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    messages.push(responseMessage);

    for (const toolCall of responseMessage.tool_calls) {
      if (toolCall.function.name === 'tavily_search') {
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          const searchQuery = args.query || question;
          const searchResult = await searchWithTavily(searchQuery, tavilyApiKey);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(searchResult),
          });
        } catch (searchError) {
          console.error('Error saat menjalankan Tavily tool:', searchError);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Pencarian gagal: ${searchError.message}` }),
          });
        }
      }
    }

    // Panggilan kedua ke Groq untuk menghasilkan jawaban akhir dengan data hasil pencarian
    const followUpRes = await fetch(GROQ_API_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
      }),
    });

    if (!followUpRes.ok) {
      const errorText = await followUpRes.text();
      throw new Error(`Groq follow-up error [${followUpRes.status}]: ${errorText}`);
    }

    const followUpData = await followUpRes.json();
    const finalContent = followUpData.choices?.[0]?.message?.content || '';
    return cleanAIResponse(finalContent);
  }

  // Jika tidak ada tool call, langsung return konten jawaban
  return cleanAIResponse(responseMessage.content || '');
}

/**
 * Menjawab pertanyaan yang disertai gambar menggunakan Groq Vision Model.
 * Catatan: Model vision tidak mendukung tool-calling web search.
 *
 * @param {string} question - Pertanyaan pengguna tentang gambar
 * @param {string} imageUrl - URL gambar yang dilampirkan dari Discord
 * @param {object} env - Environment variables ({ GROQ_API_KEY })
 * @returns {Promise<string>} - Jawaban analisis gambar AI
 */
export async function askGroqVision(question, imageUrl, env = process.env) {
  const groqApiKey = env.GROQ_API_KEY;

  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY belum dikonfigurasi.');
  }

  const model = env.GROQ_VISION_MODEL || DEFAULT_VISION_MODEL;

  const messages = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\nKamu sedang menganalisis gambar yang dikirimkan oleh pengguna. Jelaskan dan analisis detail gambar tersebut secara akurat sesuai pertanyaan.`,
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: question || 'Tolong deskripsikan dan analisis gambar ini secara detail.',
        },
        {
          type: 'image_url',
          image_url: {
            url: imageUrl,
          },
        },
      ],
    },
  ];

  const res = await fetch(GROQ_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq Vision API error [${res.status}]: ${errorText}`);
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content || '';

  return cleanAIResponse(rawContent);
}

/**
 * Merangkum riwayat pesan obrolan seorang user menggunakan Groq Text Model.
 *
 * @param {string} targetUserTag - Nama atau mention user target
 * @param {Array<{ channelName: string, content: string, timestamp: string }>} messages - Daftar pesan
 * @param {number} days - Rentang hari
 * @param {object} env - Environment variables
 * @returns {Promise<string>} - Rangkuman aktivitas dalam markdown Discord
 */
export async function summarizeUserActivity(targetUserTag, messages, days, env = process.env) {
  const groqApiKey = env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY belum dikonfigurasi.');
  }

  const model = env.GROQ_TEXT_MODEL || DEFAULT_TEXT_MODEL;

  if (!messages || messages.length === 0) {
    return `Tidak ditemukan aktivitas pesan dari **${targetUserTag}** dalam rentang ${days} hari terakhir di channel yang dapat diakses bot.`;
  }

  // Format pesan ke dalam teks yang rapi untuk prompt
  const messageLogs = messages
    .map((m) => `[#${m.channelName} | ${m.timestamp.slice(0, 10)}] ${m.content}`)
    .join('\n');

  const prompt = `Berikut adalah riwayat chat dari pengguna **${targetUserTag}** dalam ${days} hari terakhir (${messages.length} pesan ditemukan):

\`\`\`
${messageLogs.slice(0, 15000)}
\`\`\`

Tolong buatkan ringkasan aktivitas pengguna tersebut dengan struktur berikut:
1. **Ringkasan Topik Utama**: Apa saja fokus topik atau isu yang dibicarakan oleh pengguna ini?
2. **Channel Paling Aktif**: Di channel mana saja pengguna paling banyak berinteraksi?
3. **Gaya Komunikasi**: Bagaimana sentimen atau karakteristik cara bicaranya (santai, teknis, sering bertanya, membantu orang lain, dll)?
4. **Poin-Poin Menarik / Highlight**: Hal-hal menonjol atau pernyataan penting yang disampaikan.

Tulis dengan gaya yang bersahabat, objektif, dan gunakan formatting Discord (bullet points, bold).`;

  const res = await fetch(GROQ_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'Kamu adalah analis komunitas Discord yang objektif, teliti, dan ramah. Rangkum aktivitas chat anggota server secara padat dan informatif.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq Activity Summary error [${res.status}]: ${errorText}`);
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content || '';

  return cleanAIResponse(rawContent);
}

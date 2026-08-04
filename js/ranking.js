// Ranking online via Supabase (REST direto, sem SDK)
// A chave publishable é pública por design: as policies do banco só permitem
// SELECT e INSERT na tabela ranking — ninguém altera nem apaga pontuações.
const SUPABASE_URL = 'https://nzjvvtuwdbobidtjfgio.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kgNSHJRnUC-93mmez7yCiw_gD1_fhI4';

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json'
};

// Registra a pontuação e devolve a linha criada (com id) — ou null se falhar
export async function enviarPontuacao(nome, pontos) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/ranking', {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=representation' },
      body: JSON.stringify({ nome: nome.slice(0, 20), pontos })
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  } catch {
    return null;
  }
}

// Top 10 por pontos (empate: quem fez primeiro fica na frente)
export async function buscarTop10() {
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/ranking?select=id,nome,pontos&order=pontos.desc,created_at.asc&limit=10',
      { headers: HEADERS }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

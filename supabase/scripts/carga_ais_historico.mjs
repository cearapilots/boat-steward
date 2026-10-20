/**
 * Carga do histórico AIS (2025-01-01 a 2026-09-10) em `posicoes_ais`.
 *
 * Alternativa à importação pelo painel: 25 MB por arquivo costuma travar o
 * navegador, e dividir em 15 pedaços é convite a erro humano.
 *
 * Autentica com uma conta do PRÓPRIO APP. A policy "usuarios autenticados
 * podem tudo" já autoriza a escrita, então não usa — nem pede — a chave
 * service_role. As credenciais vêm de variável de ambiente e não ficam no
 * arquivo.
 *
 *   set AIS_EMAIL=seu@email
 *   set AIS_SENHA=suasenha
 *   node supabase/scripts/carga_ais_historico.mjs "C:\caminho\da\pasta"
 *
 * Idempotente: usa upsert com resolution=merge-duplicates. Rodar de novo
 * reescreve as mesmas linhas em vez de duplicar, então uma execução
 * interrompida é retomada só rodando outra vez.
 */
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";

const URL_BASE = "https://ejmlhoxhiupdobdlzjnh.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqbWxob3hoaXVwZG9iZGx6am5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjU5OTIsImV4cCI6MjA5MTgwMTk5Mn0.Mssrl4bVxE_KGj3Rqv7tGIBLafhP9UokBVHQU2PsFEM";

const LOTE = 1000;
const CABECALHO = "CD_LANCHA,DS_LANCHA,NR_MMSI,DH_POSICAO,DC_LATITUDE,DC_LONGITUDE,DC_SOG,DC_COG";

const pasta = process.argv[2];
const email = process.env.AIS_EMAIL;
const senha = process.env.AIS_SENHA;
if (!pasta || !email || !senha) {
  console.error("uso: AIS_EMAIL=... AIS_SENHA=... node carga_ais_historico.mjs <pasta>");
  process.exit(1);
}

async function autenticar() {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  if (!r.ok) throw new Error(`login falhou: HTTP ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

const nulo = (v) => (v === undefined || v.trim() === "" ? null : v.trim());
const numero = (v) => (nulo(v) === null ? null : Number(v));

/** Mesma regra da Edge Function: hora de Fortaleza, truncada ao segundo. */
function paraUtc(bruto) {
  const s = (bruto ?? "").trim();
  if (!s) return null;
  return `${s.replace(/\.\d+$/, "")}-03:00`;
}

async function enviar(linhas, token) {
  const r = await fetch(
    `${URL_BASE}/rest/v1/posicoes_ais?on_conflict=cd_lancha,dh_posicao,tem_posicao`,
    {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(linhas),
    },
  );
  if (r.status === 401) return "expirou";
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return "ok";
}

let token = await autenticar();
const arquivos = (await readdir(pasta)).filter((f) => f.toLowerCase().endsWith(".csv")).sort();
if (arquivos.length === 0) throw new Error(`nenhum .csv em ${pasta}`);

for (const arquivo of arquivos) {
  console.log(`\n== ${arquivo}`);
  const rl = createInterface({ input: createReadStream(join(pasta, arquivo)), crlfDelay: Infinity });

  let lote = [];
  let enviadas = 0, descartadas = 0, primeira = true;

  const despachar = async () => {
    if (lote.length === 0) return;
    if ((await enviar(lote, token)) === "expirou") {
      token = await autenticar();
      if ((await enviar(lote, token)) === "expirou") throw new Error("sessão expirou duas vezes");
    }
    enviadas += lote.length;
    lote = [];
    if (enviadas % (LOTE * 20) === 0) console.log(`   ${enviadas.toLocaleString("pt-BR")} linhas`);
  };

  for await (const linha of rl) {
    if (primeira) {
      primeira = false;
      const cab = linha.replace(/^\uFEFF/, "").trim();
      // Trava de segurança: formato diferente do esperado aborta antes de gravar.
      if (cab !== CABECALHO) throw new Error(`cabeçalho inesperado em ${arquivo}:\n  ${cab}`);
      continue;
    }
    if (!linha.trim()) continue;

    const c = linha.split(",");
    const dh = paraUtc(c[3]);
    if (nulo(c[0]) === null || dh === null) { descartadas++; continue; }

    lote.push({
      cd_lancha:    Number(c[0]),
      ds_lancha:    nulo(c[1]) ?? "",
      nr_mmsi:      numero(c[2]),
      dh_posicao:   dh,
      dc_latitude:  numero(c[4]),
      dc_longitude: numero(c[5]),
      dc_sog:       numero(c[6]),
      dc_cog:       numero(c[7]),
    });

    if (lote.length >= LOTE) await despachar();
  }
  await despachar();
  console.log(`   concluído: ${enviadas.toLocaleString("pt-BR")} enviadas, ${descartadas} descartadas`);
}

console.log("\nCarga terminada. Confira com a ETAPA 4 de carga_ais_historico.sql.");

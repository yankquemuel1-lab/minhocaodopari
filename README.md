# Minhocão do Pari 3D — A Lenda

Jogo 3D no navegador baseado na lenda do Minhocão do Pari (Mato Grosso), criado para o evento da Casa di Rose.

Explore a beira do Rio Quilombo na Chapada dos Guimarães, converse com Seu Maneca, monte no Minhocão e desça o rio até Cuiabá desviando de obstáculos — com ranking online dos melhores domadores.

## Como funciona

- **100% estático** — HTML + CSS + JavaScript (Three.js via CDN), sem build e sem backend próprio.
- **Ranking online** — Supabase (REST direto do navegador; o banco só aceita leitura e inserção de pontuações).
- **Controles** — WASD/setas para andar, E para conversar, A/D ou ←/→ para desviar na corrida, Esc ou P para pausar. Feito para teclado (computador).
- **Pausa** — disponível durante a exploração e a corrida (não durante a cutscene). "Voltar ao menu" na tela de pausa recarrega a página sem registrar pontuação nenhuma no ranking.

## Rodar localmente

```bash
python -m http.server 8124
# abrir http://localhost:8124
```

## Atalhos de debug (querystring)

- `?auto=1&char=girl` — pula o menu direto pro jogo
- `&cena=ride` / `&cena=cutscene` — pula direto para uma cena
- `&cena=gameover&pontos=210` — tela final com score arbitrário
- `&cutfreeze=6.1` — congela a cutscene no instante dado (para screenshots)
- `&testpause=1` — abre a tela de pausa já no início (para testar/fotografar)

## Deploy

Hospedado na Vercel como site estático — basta importar este repositório, sem configuração de build (output = raiz).

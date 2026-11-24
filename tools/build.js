/*
 * Build do projeto. Rode com: node tools/build.js
 *  1. casos-fonte/** /*.json  ->  site/casos/<id>.json   (versão pública, sem gabarito)
 *  2. shared/stats.js          ->  site/assets/stats.js
 *  3. backend/Codigo.gs        (arquivo único para colar no Apps Script, com gabaritos)
 *  4. demo/demo.html           (demonstração que roda sozinha no navegador; contém gabarito, não publicar)
 */
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const ler = p => fs.readFileSync(path.join(raiz, p), 'utf8');
const gravar = (p, s) => { fs.mkdirSync(path.dirname(path.join(raiz, p)), { recursive: true }); fs.writeFileSync(path.join(raiz, p), s); };

function semPrivados(x) {
  if (Array.isArray(x)) return x.map(semPrivados);
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) if (k[0] !== '_') o[k] = semPrivados(x[k]);
    return o;
  }
  return x;
}

// 1. Casos e imagens
const casos = {};
fs.rmSync(path.join(raiz, 'site/casos'), { recursive: true, force: true });
for (const ex of fs.readdirSync(path.join(raiz, 'casos-fonte'))) {
  const dir = path.join('casos-fonte', ex);
  if (ex === 'img' || !fs.statSync(path.join(raiz, dir)).isDirectory()) continue;
  for (const arq of fs.readdirSync(path.join(raiz, dir)).filter(a => a.endsWith('.json'))) {
    const c = JSON.parse(ler(path.join(dir, arq)));
    if (casos[c.id]) throw new Error('Caso repetido: ' + c.id);
    casos[c.id] = c;
    const pub = semPrivados(c);
    const txt = JSON.stringify(pub);
    if (/_gabarito|_explicacao|_texto|_modelo|_evento|_revelacao/.test(txt)) throw new Error('Vazou campo privado em ' + c.id);
    gravar('site/casos/' + c.id + '.json', JSON.stringify(pub, null, 1));
  }
}
console.log('Casos:', Object.keys(casos).join(', '));
for (const id in casos) {
  const img = casos[id].imagem;
  if (!img) continue;
  const origem = path.join('casos-fonte', img);
  if (!fs.existsSync(path.join(raiz, origem))) throw new Error('Imagem não encontrada: ' + origem);
  gravar('site/casos/' + img, ler(origem));
}

// 2. Stats para o navegador
gravar('site/assets/stats.js', ler('shared/stats.js'));

// 3. Apps Script
const cab = '/*\n * Desafios de IA: servidor do jogo (Google Apps Script).\n * ARQUIVO GERADO por tools/build.js. Não edite aqui: edite shared/, backend/adaptador.gs.js e casos-fonte/.\n * Gerado em ' + new Date().toISOString() + '\n */\n\n';
const gs = cab + ler('shared/stats.js') + '\n\n' + ler('shared/server-core.js') + '\n\nvar CASOS = ' + JSON.stringify(casos) + ';\n\n' + ler('backend/adaptador.gs.js');
gravar('backend/Codigo.gs', gs);
console.log('backend/Codigo.gs:', Math.round(gs.length / 1024), 'KB');

// 4. Demo
const css = ler('site/assets/estilo.css');
function pagina(js, extra) {
  const scripts = ['site/assets/comum.js', 'site/assets/' + js + '.js'].map(p => '<script>' + ler(p) + '<\/script>').join('\n');
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..800&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">' +
    '<style>' + css + '</style></head><body><div id="app"></div><script>window.DESAFIOS_CONFIG={apiUrl:""};' + (extra || '') + '<\/script><script>' + ler('shared/stats.js') + '<\/script>' + scripts + '</body></html>';
}
const paginas = { aluno: pagina('aluno'), professor: pagina('professor'), telao: pagina('telao'), espiar: pagina('aluno', 'window.DESAFIOS_ESPIAR=true;') };
const publicos = {};
for (const id in casos) {
  publicos[id] = semPrivados(casos[id]);
  if (casos[id].imagem) publicos[id].imagemDados = 'data:image/svg+xml;base64,' + Buffer.from(ler(path.join('casos-fonte', casos[id].imagem))).toString('base64');
}
const seguro = s => JSON.stringify(s).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
const demo = ler('tools/demo-shell.html')
  .replace('/*__STATS__*/', ler('shared/stats.js'))
  .replace('/*__CORE__*/', ler('shared/server-core.js'))
  .replace('/*__DADOS__*/', 'var CASOS_COMPLETOS = ' + seguro(casos) + ';\nvar DEMO_CASOS_PUBLICOS = ' + seguro(publicos) + ';\nvar PAGINAS = ' + seguro(paginas) + ';');
gravar('demo/demo.html', demo);
console.log('demo/demo.html:', Math.round(demo.length / 1024), 'KB');

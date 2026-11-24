/* Confere a estrutura e a pontuação de todos os casos. Rode: node tools/validar-casos.js */
global.Stats = require('../shared/stats.js');
const SC = require('../shared/server-core.js');
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..', 'casos-fonte');
const casos = {};
fs.readdirSync(raiz).filter(d => d !== 'img').forEach(d => fs.readdirSync(path.join(raiz, d)).filter(a => a.endsWith('.json')).forEach(a => { const c = JSON.parse(fs.readFileSync(path.join(raiz, d, a))); casos[c.id] = c; }));
let erros = 0; const err = (id, m) => { erros++; console.log('  ERRO', id + ':', m); };
const melhor = g => Object.keys(g).reduce((a, b) => g[b] > g[a] ? b : a);
for (const id in casos) {
  const c = casos[id], agr = c._modelo.tipo === 'agrupamento';
  if (!fs.existsSync(path.join(raiz, c.imagem))) err(id, 'imagem ausente');
  if (c.fases.map(f => f.id).join() !== 'f1,f2,f3,evento') err(id, 'fases');
  const cont = {}; c.fases[1].itens[0].cartas.forEach(k => cont[k._gabarito] = (cont[k._gabarito] || 0) + 1);
  const cx = c.caixas.map(x => x.id);
  if ([cont[cx[0]], cont[cx[1]], cont[cx[2]], cont[cx[3]]].join() !== '9,3,2,2') err(id, 'distribuição de cartas ' + JSON.stringify(cont));
  c.fases.forEach(f => f.itens.forEach(i => { if (!i.rotulo) err(id, 'item sem rótulo ' + i.id); if (i.tipo === 'escolha' && i.opcoes.length !== 4) err(id, 'opções ' + i.id); }));
  const somas = c.fases.map(f => f.itens.reduce((s, i) => s + (i.pontosMax || 0), 0));
  if (somas.join() !== '25,40,25,10') err(id, 'pontos máximos ' + somas);
  Object.keys(c._evento).forEach(k => { const e = c._evento[k]; if (!e._gabarito || !e._gabarito.evq1 || !e._gabarito.evq2 || !e.feed) err(id, 'evento ' + k); });
  // Partida perfeita e partida com armadilhas
  const jogar = (armadilha) => {
    const mem = {}; let t = 1e12;
    const store = { get: k => mem[k] ? JSON.parse(mem[k]) : null, set: (k, v) => { mem[k] = JSON.stringify(v); }, del: k => { delete mem[k]; } };
    const s = SC.create({ store, casos: { [id]: c }, config: { chaveProfessor: 'x', grupos: [{ codigo: 'G', nome: 'G', caso: id }] }, agora: () => t });
    const h = r => { const x = s.handle(Object.assign({ chave: 'x', codigo: 'G' }, r)); if (x.erro) err(id, r.acao + ' ' + x.erro); return x; };
    const resp = fid => { const o = {}; c.fases.find(f => f.id === fid).itens.forEach(i => { if (i._gabarito && i.tipo === 'escolha') o[i.id] = melhor(i._gabarito); }); return o; };
    h({ acao: 'entrar', membros: ['a'] }); h({ acao: 'prof_fase', fase: 1 });
    const r1 = resp('f1'); if (armadilha && c._modelo.rotulo) r1[c._modelo.rotulo.item] = c._modelo.rotulo.ruins[0];
    h({ acao: 'enviar', faseId: 'f1', respostas: r1 }); t += 4e5; h({ acao: 'prof_fase', fase: 2 });
    const cartas = {}; c.fases[1].itens[0].cartas.forEach(k => cartas[k.id] = k._gabarito);
    if (armadilha) { const k = c.fases[1].itens[0].cartas.find(k => k._gabarito === cx[1]); cartas[k.id] = cx[0]; }
    c.fases[1].itens[1].fontes.filter(f => f._gabarito.pontos > 0).forEach(f => h({ acao: 'comprar', fonteId: f.id }));
    h({ acao: 'enviar', faseId: 'f2', respostas: { f2cartas: cartas } }); t += 8e5; h({ acao: 'prof_fase', fase: 3 });
    const r3 = resp('f3'); if (armadilha && agr) r3[c._modelo.padroniza.item] = 'a';
    const m = h({ acao: 'treinar', respostas: r3 }).modelo;
    const lab = c.fases[2].itens.find(i => i.tipo === 'simulador' || i.tipo === 'agrupamento');
    if (agr) r3[lab.id] = { k: Number(melhor(lab._gabarito)) }; else r3[lab.id] = { pct: Stats.otimo(m.aucValidacao, c.simulador).pct };
    h({ acao: 'enviar', faseId: 'f3', respostas: r3 }); t += 5e5; h({ acao: 'prof_fase', fase: 4 });
    const g = mem['g:G'] && JSON.parse(mem['g:G']), cen = g.modelo.cenario, ge = c._evento[cen]._gabarito;
    h({ acao: 'enviar', faseId: 'evento', respostas: { evq1: melhor(ge.evq1), evq2: melhor(ge.evq2) } });
    const p = h({ acao: 'prof_placar' }).grupos[0];
    return { cen, total: p.total, pontos: p.pontos, metrica: p.metrica, extra: agr ? '' : 'ótimo ' + Stats.otimo(m.aucValidacao, c.simulador).pct + '% (AUC ' + m.aucValidacao + ')' };
  };
  const bom = jogar(false), ruim = jogar(true);
  console.log((agr ? '[clustering] ' : '[supervisionado] ') + id);
  console.log('   perfeito:', bom.total, JSON.stringify(bom.pontos), bom.cen, bom.extra);
  console.log('   armadilha:', ruim.total, JSON.stringify(ruim.pontos), ruim.cen, JSON.stringify(ruim.metrica));
  if (bom.pontos.f1 !== 25 || bom.pontos.f2 !== 40 || bom.pontos.evento !== 10) err(id, 'partida perfeita não fez o máximo');
}
console.log(erros ? erros + ' erro(s)' : 'Todos os casos conferem.');
process.exit(erros ? 1 : 0);

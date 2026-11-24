/*
 * Desafios de IA: servidor do jogo (Google Apps Script).
 * ARQUIVO GERADO por tools/build.js. Não edite aqui: edite shared/, backend/adaptador.gs.js e casos-fonte/.
 * Gerado em 2026-11-24T16:05:43.321Z
 */

/* Estatística do simulador. Usado no navegador e no Apps Script. */
var Stats = (function () {
  function erf(x) {
    // Abramowitz & Stegun 7.1.26 com refinamento suficiente para o simulador
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function cdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
  function inv(p) {
    // Acklam
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var pl = 0.02425, q, r;
    if (p <= 0) return -8; if (p >= 1) return 8;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }

  /* Modelo binormal: scores dos positivos ~ N(d,1), negativos ~ N(0,1), AUC = Phi(d/sqrt2). */
  function simular(auc, p, pct) {
    var d = Math.SQRT2 * inv(auc), pi = p.prevalencia, alvo = pct / 100;
    var lo = -10, hi = 10, t = 0;
    for (var i = 0; i < 80; i++) {
      t = (lo + hi) / 2;
      var f = pi * (1 - cdf(t - d)) + (1 - pi) * (1 - cdf(t));
      if (f > alvo) lo = t; else hi = t;
    }
    var tpr = 1 - cdf(t - d), fpr = 1 - cdf(t), n = p.baseClientes;
    var tp = n * pi * tpr, fp = n * (1 - pi) * fpr, fn = n * pi - tp, tn = n * (1 - pi) - fp;
    var salvos = tp * p.taxaSalvamento;
    var valor = salvos * p.valorCliente - (tp + fp) * p.custoAcao;
    return {
      pct: pct, vp: Math.round(tp), fp: Math.round(fp), fn: Math.round(fn), vn: Math.round(tn),
      precisao: tp + fp > 0 ? tp / (tp + fp) : 0, recall: tpr,
      acuracia: (tp + tn) / n, salvos: Math.round(salvos), custo: Math.round((tp + fp) * p.custoAcao),
      receitaSalva: Math.round(salvos * p.valorCliente), valor: Math.round(valor)
    };
  }

  function otimo(auc, p) {
    var melhor = null;
    for (var x = p.minPct; x <= p.maxPct + 1e-9; x += 0.5) {
      var s = simular(auc, p, x);
      if (!melhor || s.valor > melhor.valor) melhor = s;
    }
    return melhor;
  }

  /* Acurácia "no limiar padrão": o modelo aponta como positivos tantos clientes quanto a prevalência. */
  function acuraciaPadrao(auc, p) { return simular(auc, p, p.prevalencia * 100).acuracia; }

  return { cdf: cdf, inv: inv, simular: simular, otimo: otimo, acuraciaPadrao: acuraciaPadrao };
})();
if (typeof module !== 'undefined') module.exports = Stats;


/*
 * Núcleo do servidor do jogo. Roda igual no Google Apps Script (produção)
 * e no navegador (modo demonstração). Não depende de nenhuma API externa:
 * recebe um "store" (get/set/del), os casos completos (com gabarito) e a configuração.
 */
var ServerCore = (function () {
  var FASES = ['lobby', 'f1', 'f2', 'f3', 'evento', 'pitch', 'revelacao'];
  var TITULOS_FASE = ['Sala de espera', 'Enquadre o problema', 'Monte o dataset', 'Modele e avalie', 'Seis meses depois', 'Pitch ao comitê', 'Revelação'];
  var JOGAVEIS = { f1: 1, f2: 2, f3: 3, evento: 4 };
  var DURACOES = { f1: 6, f2: 12, f3: 8, evento: 6 };

  function fmtAuc(x) { return (Math.round(x * 100) / 100).toFixed(2).replace('.', ','); }
  function fmt1(x) { return (Math.round(x * 10) / 10).toString().replace('.', ','); }
  function fmtPct(x) { return (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',') + '%'; }
  function fmtReais(x) { var s = Math.round(Math.abs(x)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (x < 0 ? '-R$ ' : 'R$ ') + s; }
  function fmtInt(x) { return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function limpar(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200); }
  function achar(lista, id) { for (var i = 0; i < (lista || []).length; i++) if (lista[i].id === id) return lista[i]; return null; }
  function lim15(x) { return Math.max(0, Math.min(15, Math.round(x))); }
  /* Bônus de desempenho: AUC (supervisionado) ou silhueta e nota do comitê (agrupamento). */
  function bonusDesempenho(m, fase) {
    if (!m) return 0;
    if (m.tipo === 'agrupamento') {
      if (fase === 'producao') return m.valorProducao == null ? 0 : lim15(m.valorProducao * 15);
      return m.valorTreino == null ? 0 : lim15(m.valorTreino * 25);
    }
    return lim15(((fase === 'producao' ? m.aucProducao : m.aucValidacao) - 0.5) * 30);
  }
  function fmtMilhoes(v) {
    if (v < 1) return 'R$ ' + Math.round(v * 1000) + ' mil';
    if (v < 1000) { var r = Math.round(v); return 'R$ ' + r + (r === 1 ? ' milhão' : ' milhões'); }
    return 'R$ ' + (Math.round(v / 100) / 10).toString().replace('.', ',') + ' bilhões';
  }

  function create(opts) {
    var store = opts.store, casos = opts.casos, cfg = opts.config;
    var agora = opts.agora || function () { return Date.now(); };
    var registrar = opts.registrar || function () {};
    var comTrava = opts.comTrava || function (fn) { return fn(); };
    var aleatorio = opts.aleatorio || Math.random;
    var duracoes = cfg.duracoes || DURACOES;

    function normCodigo(c) { return limpar(c, 40).toUpperCase().replace(/\s+/g, ''); }
    function cfgGrupo(codigo) {
      var c = normCodigo(codigo);
      for (var i = 0; i < cfg.grupos.length; i++) if (normCodigo(cfg.grupos[i].codigo) === c) return cfg.grupos[i];
      return null;
    }
    function lerGlobal() {
      return store.get('global') || { fase: 0, prazo: null, aberta: null, sorteio: null, projetar: null, feed: [], seq: 0 };
    }
    function salvarGlobal(g) { store.set('global', g); }
    function lerGrupo(codigo) { return store.get('g:' + normCodigo(codigo)); }
    function salvarGrupo(g) { store.set('g:' + g.codigo, g); }
    function marcarVisto(codigo) { store.set('v:' + normCodigo(codigo), agora()); }
    function online(codigo) { var v = store.get('v:' + normCodigo(codigo)); return !!(v && agora() - v < 25000); }
    function novoGrupo(c) {
      var caso = casos[c.caso];
      return {
        codigo: normCodigo(c.codigo), nome: c.nome, caso: c.caso, membros: [],
        creditos: caso.creditosIniciais || 100, compras: [], dicas: [], rascunhos: {}, enviadas: {},
        modelo: null, pontos: { f1: 0, f2: 0, f3: 0, evento: 0, desempenho: 0, velocidade: 0 },
        telemetria: { saidas: 0, tempoForaMs: 0, colagens: 0, charsColados: 0, insercoesGrandes: 0 },
        entrou: agora()
      };
    }
    function todosGrupos() {
      var out = [];
      cfg.grupos.forEach(function (c) { var g = lerGrupo(c.codigo); if (g) out.push(g); });
      return out;
    }
    function total(g) {
      var p = g.pontos;
      return p.f1 + p.f2 + p.f3 + p.evento + p.desempenho + p.velocidade + Math.floor(Math.max(0, g.creditos) / 10);
    }
    function feed(glob, texto, tipo) {
      glob.seq = (glob.seq || 0) + 1;
      glob.feed.push({ id: glob.seq, ts: agora(), texto: texto, tipo: tipo || 'info' });
      if (glob.feed.length > 25) glob.feed = glob.feed.slice(-25);
    }
    function faseCaso(caso, faseId) { return achar(caso.fases, faseId); }
    function respostasDe(g, faseId) {
      if (g.enviadas[faseId]) return g.enviadas[faseId].respostas || {};
      return g.rascunhos[faseId] || {};
    }
    function itemPorTipo(caso, tipo) {
      for (var i = 0; i < caso.fases.length; i++) for (var j = 0; j < caso.fases[i].itens.length; j++)
        if (caso.fases[i].itens[j].tipo === tipo) return { fase: caso.fases[i], item: caso.fases[i].itens[j] };
      return null;
    }

    /* ---------- Modelo simulado ---------- */
    function calcularModelo(caso, g) {
      return caso._modelo.tipo === 'agrupamento' ? calcularAgrupamento(caso, g) : calcularSupervisionado(caso, g);
    }
    function calcularSupervisionado(caso, g) {
      var m = caso._modelo, cartas = itemPorTipo(caso, 'cartas'), merc = itemPorTipo(caso, 'mercado');
      var resp = (respostasDe(g, cartas.fase.id)[cartas.item.id]) || {};
      var honesto = m.aucBase, rv = 0, rp = 0, vaz = [], sens = [], ruido = [], usadas = [];
      cartas.item.cartas.forEach(function (c) {
        var ehFeature = resp[c.id] === 'feature';
        if (ehFeature) usadas.push(c.nome);
        if (c._gabarito === 'feature' && !ehFeature) honesto -= (m.pesoFeature[c.id] != null ? m.pesoFeature[c.id] : m.pesoFeature.padrao);
        if (ehFeature && c._gabarito === 'sensivel') { honesto += m.ganhoSensivel; sens.push(c.nome); }
        if (ehFeature && c._gabarito === 'descartar') { rv += m.ruido.validacao; rp += m.ruido.producao; ruido.push(c.nome); }
        if (ehFeature && c._gabarito === 'vazamento') vaz.push(c.nome);
      });
      var redes = false;
      if (merc) g.compras.forEach(function (id) {
        var f = achar(merc.item.fontes, id);
        if (f) { honesto += f._gabarito.auc || 0; if (f._gabarito.flag === 'redes') redes = true; }
      });
      var div = m.divisao ? respostasDe(g, 'f3')[m.divisao.item] : null;
      var infl = div && m.divisao.inflacao[div] != null ? m.divisao.inflacao[div] : 0;
      function lim(x) { return Math.round(Math.min(m.aucMax, Math.max(m.aucMin, x)) * 1000) / 1000; }
      var val = vaz.length ? m.vazamento.aucValidacao : lim(honesto + infl + rv);
      var prod = vaz.length ? lim(honesto - m.vazamento.quedaProducao + rp) : lim(honesto - m.drift + rp);
      return {
        tipo: 'supervisionado', metrica: 'AUC', base: div || null,
        aucValidacao: val, aucProducao: prod, divisao: div || null, valorTreino: val, valorProducao: prod,
        acuracia: Stats.acuraciaPadrao(val, caso.simulador), acuraciaIngenua: 1 - caso.simulador.prevalencia,
        cenario: vaz.length ? 'vazamento' : 'drift', nFeatures: usadas.length,
        flags: { vazamento: vaz, sensivel: sens, ruido: ruido, redes: redes, circular: [] }
      };
    }

    function calcularAgrupamento(caso, g) {
      var m = caso._modelo, cartas = itemPorTipo(caso, 'cartas'), merc = itemPorTipo(caso, 'mercado'), lab = itemPorTipo(caso, 'agrupamento');
      var resp = (respostasDe(g, cartas.fase.id)[cartas.item.id]) || {};
      var ajuste = 0, circ = [], sens = [], ruido = [], usadas = [], redes = false;
      cartas.item.cartas.forEach(function (c) {
        var ag = resp[c.id] === 'agrupar';
        if (ag) usadas.push(c.nome);
        if (c._gabarito === 'agrupar' && !ag) ajuste -= (m.pesoCarta[c.id] != null ? m.pesoCarta[c.id] : m.pesoCarta.padrao);
        if (ag && c._gabarito === 'descrever') circ.push(c.nome);
        if (ag && c._gabarito === 'sensivel') sens.push(c.nome);
        if (ag && c._gabarito === 'descartar') { ajuste += m.ruido; ruido.push(c.nome); }
      });
      if (merc) g.compras.forEach(function (id) {
        var f = achar(merc.item.fontes, id);
        if (f) { ajuste += f._gabarito.auc || 0; if (f._gabarito.flag === 'redes') redes = true; }
      });
      var base = respostasDe(g, lab.fase.id)[m.padroniza.item] || null;
      var padronizado = m.padroniza.respostas.indexOf(base) >= 0;
      var cenario = !padronizado ? 'escala' : (circ.length ? 'circular' : 'drift');
      var fator = cenario === 'escala' ? 0.25 : 1, sil = {};
      for (var k in m.silhueta[cenario]) sil[k] = Math.round(Math.min(0.95, Math.max(0.05, m.silhueta[cenario][k] + ajuste * fator)) * 100) / 100;
      var k0 = (respostasDe(g, lab.fase.id)[lab.item.id] || {}).k;
      var mod = {
        tipo: 'agrupamento', metrica: 'Silhueta', base: base, cenario: cenario, silhuetas: sil, perfis: perfisAgrupamento(caso, cenario),
        nFeatures: usadas.length, k: null, valorTreino: null, valorProducao: null,
        flags: { vazamento: [], circular: circ, sensivel: sens, ruido: ruido, redes: redes }
      };
      if (k0) definirK(caso, mod, k0);
      return mod;
    }
    function definirK(caso, mod, k) {
      k = String(k);
      if (!mod.silhuetas[k]) return;
      mod.k = Number(k); mod.valorTreino = mod.silhuetas[k];
      mod.valorProducao = caso._modelo.producao[mod.cenario];
    }
    function perfisAgrupamento(caso, cenario) {
      var m = caso._modelo, ag = caso.agrupamento, out = {};
      for (var k = ag.kMin; k <= ag.kMax; k++) {
        if (cenario === 'escala') {
          var o = m.orcamento, pesos = [], soma = 0, lista = [];
          for (var i = 0; i < k; i++) { pesos.push(Math.pow(0.5, i)); soma += pesos[i]; }
          var resto = ag.total;
          for (i = 0; i < k; i++) {
            var de = o.min * Math.pow(o.max / o.min, i / k), ate = o.min * Math.pow(o.max / o.min, (i + 1) / k);
            var n = i === k - 1 ? resto : Math.round(ag.total * pesos[i] / soma); resto -= n;
            lista.push({ nome: 'Faixa ' + (i + 1) + ' de orçamento', n: n,
              tracos: ['Orçamento de ' + fmtMilhoes(de) + ' a ' + fmtMilhoes(ate), 'Partes interessadas, exposição regulatória e novidade quase não mudam de um grupo para outro'],
              desvio: '+' + (17 + (i % 3)) + '%' });
          }
          out[k] = lista;
        } else {
          out[k] = (m.perfis[k] || []).map(function (p, i) {
            var c = JSON.parse(JSON.stringify(p));
            if (cenario === 'circular') c.tracos.unshift('Composição: ' + (84 + (i * 3) % 10) + '% dos projetos com porte ' + ['P', 'M', 'G'][i % 3]);
            return c;
          });
        }
      }
      return out;
    }

    /* ---------- Pontuação ---------- */
    function gabaritoEscolha(caso, faseId, item, g) {
      if (item._gabarito) return item._gabarito;
      if (faseId === 'evento' && g.modelo && caso._evento) return caso._evento[g.modelo.cenario]._gabarito[item.id];
      return null;
    }
    function pontuar(caso, faseId, resp, g) {
      var fase = faseCaso(caso, faseId), total = 0, det = {};
      fase.itens.forEach(function (it) {
        var r = resp[it.id], pts = 0;
        if (it.tipo === 'escolha') {
          var gab = gabaritoEscolha(caso, faseId, it, g);
          pts = gab && r != null ? (gab[r] || 0) : 0;
        } else if (it.tipo === 'cartas') {
          it.cartas.forEach(function (c) { if (r && r[c.id] === c._gabarito) pts += it.pontosPorCarta; });
        } else if (it.tipo === 'mercado') {
          g.compras.forEach(function (id) { var f = achar(it.fontes, id); if (f) pts += f._gabarito.pontos; });
        } else if (it.tipo === 'agrupamento') {
          if (g.modelo && r && r.k) pts = it._gabarito[String(r.k)] || 0;
        } else if (it.tipo === 'simulador') {
          if (g.modelo && r && r.pct) {
            var v = Stats.simular(g.modelo.aucValidacao, caso.simulador, Number(r.pct)).valor;
            var o = Stats.otimo(g.modelo.aucValidacao, caso.simulador).valor;
            pts = o > 0 ? Math.max(0, Math.round(it.pontosMax * v / o)) : 0;
          }
        }
        det[it.id] = pts; total += pts;
      });
      return { total: Math.max(0, total), det: det };
    }

    function enviarFase(g, caso, glob, faseId, resp, automatico) {
      if (g.enviadas[faseId]) return g.enviadas[faseId];
      var t = agora();
      if (faseId === 'f3' || faseId === 'evento') g.modelo = calcularModelo(caso, mesclar(g, faseId, resp));
      var sc = pontuar(caso, faseId, resp, g);
      var rapido = !automatico && glob.prazo && (glob.prazo - t) >= 120000;
      g.enviadas[faseId] = { respostas: resp, pontos: sc.total, det: sc.det, ts: t, automatico: !!automatico, rapido: !!rapido };
      delete g.rascunhos[faseId];
      g.pontos[faseId] = sc.total;
      if (rapido) g.pontos.velocidade += 2;
      var tituloFase = faseCaso(caso, faseId).titulo;
      if (faseId === 'f3' && g.modelo) {
        g.pontos.desempenho = bonusDesempenho(g.modelo, 'treino');
        var vt = g.modelo.valorTreino;
        if (g.modelo.tipo === 'agrupamento' && vt >= 0.7) feed(glob, g.nome + ' encontrou grupos com silhueta de ' + fmtAuc(vt) + '. Impressionante.', 'alta');
        if (g.modelo.tipo !== 'agrupamento' && vt >= 0.95) feed(glob, g.nome + ' treinou um modelo com AUC de ' + fmtAuc(vt) + '. Impressionante.', 'alta');
      }
      feed(glob, automatico ? g.nome + ': ' + tituloFase + ' encerrada pelo tempo' : g.nome + ' enviou ' + tituloFase + (rapido ? ', com folga no relógio' : ''), automatico ? 'tempo' : 'envio');
      registrar({ tipo: 'envio', grupo: g.nome, codigo: g.codigo, caso: g.caso, fase: faseId, pontos: sc.total, respostas: resp, automatico: !!automatico });
      return g.enviadas[faseId];
    }
    // Garante que a divisão escolhida no rascunho/resposta da f3 entre no cálculo do modelo
    function mesclar(g, faseId, resp) {
      if (faseId === 'f3') g.rascunhos.f3 = resp;
      return g;
    }

    /* Em produção, os pontos da campanha passam a valer pelo resultado real (AUC de produção). */
    function campanha(caso, g) {
      if (caso._modelo.tipo === 'agrupamento') return null;
      var sim = itemPorTipo(caso, 'simulador'), env = g.enviadas[sim ? sim.fase.id : ''];
      if (!sim || !env || !g.modelo) return null;
      var r = env.respostas[sim.item.id];
      if (!r || !r.pct) return null;
      var p = caso.simulador, pct = Number(r.pct);
      return { item: sim.item, env: env, pct: pct, prometido: Stats.simular(g.modelo.aucValidacao, p, pct).valor, real: Stats.simular(g.modelo.aucProducao, p, pct).valor, otimoReal: Stats.otimo(g.modelo.aucProducao, p).valor };
    }
    function sim_fase(caso) { return itemPorTipo(caso, 'simulador').fase.id; }
    /* Em produção, os pontos do agrupamento passam a valer pelo uso real das trilhas. */
    function reavaliarAgrupamento(caso, g) {
      var lab = itemPorTipo(caso, 'agrupamento'), env = g.enviadas[lab.fase.id];
      if (!env || env.reavaliado || !g.modelo) return;
      var fator = caso._modelo.fatorProducao[g.modelo.cenario], antes = env.det[lab.item.id] || 0, novo = Math.round(antes * fator);
      env.det[lab.item.id] = novo; env.pontos += novo - antes; g.pontos[lab.fase.id] += novo - antes; env.reavaliado = true;
    }
    function reavaliarCampanha(caso, g) {
      if (caso._modelo.tipo === 'agrupamento') { reavaliarAgrupamento(caso, g); return null; }
      var c = campanha(caso, g);
      if (!c || c.env.reavaliado) return c;
      var novo = c.otimoReal > 0 ? Math.max(0, Math.round(c.item.pontosMax * c.real / c.otimoReal)) : 0;
      var delta = novo - (c.env.det[c.item.id] || 0);
      c.env.det[c.item.id] = novo; c.env.pontos += delta; g.pontos[sim_fase(caso)] += delta;
      c.env.reavaliado = true;
      return c;
    }

    function aplicarTelemetria(g, t) {
      if (!t || typeof t !== 'object') return;
      ['saidas', 'tempoForaMs', 'colagens', 'charsColados', 'insercoesGrandes'].forEach(function (k) {
        var v = Number(t[k]);
        if (isFinite(v) && v > 0 && v < 1e8) g.telemetria[k] = (g.telemetria[k] || 0) + Math.round(v);
      });
    }

    /* ---------- Visões ---------- */
    function textoOpcao(item, id) { var o = achar(item.opcoes, id); return o ? o.texto : null; }
    function melhorOpcao(gab) { var b = null; for (var k in gab) if (b == null || gab[k] > gab[b]) b = k; return b; }

    function ficha(caso, g) {
      var secoes = [];
      caso.fases.forEach(function (f) {
        var linhas = [], resp = respostasDe(g, f.id);
        f.itens.forEach(function (it) {
          var r = resp[it.id];
          if (it.tipo === 'escolha') linhas.push({ rotulo: it.rotulo, valor: textoOpcao(it, r) || 'Sem resposta' });
          else if (it.tipo === 'texto') linhas.push({ rotulo: it.rotulo, valor: limpar(r, 500) || 'Sem resposta', citacao: true });
          else if (it.tipo === 'cartas') {
            caso.caixas.forEach(function (cx) {
              var nomes = it.cartas.filter(function (c) { return r && r[c.id] === cx.id; }).map(function (c) { return c.nome; });
              linhas.push({ rotulo: cx.nome, valor: nomes.length ? nomes.join(', ') : 'Nenhuma', codigo: true });
            });
            var semCaixa = it.cartas.filter(function (c) { return !r || !r[c.id]; }).length;
            if (semCaixa) linhas.push({ rotulo: 'Sem classificação', valor: semCaixa + ' coluna(s)' });
          } else if (it.tipo === 'mercado') {
            var nomes = g.compras.map(function (id) { var x = achar(it.fontes, id); return x ? x.nome : id; });
            linhas.push({ rotulo: it.rotulo, valor: nomes.length ? nomes.join(', ') : 'Nenhum' });
          } else if (it.tipo === 'simulador') {
            if (g.modelo) {
              linhas.push({ rotulo: 'AUC no treino', valor: fmtAuc(g.modelo.aucValidacao) });
              if (r && r.pct) {
                var s = Stats.simular(g.modelo.aucValidacao, caso.simulador, Number(r.pct));
                linhas.push({ rotulo: 'Abordagem mensal', valor: String(r.pct).replace('.', ',') + '% dos clientes (' + fmtInt(s.vp + s.fp) + ')' });
                linhas.push({ rotulo: 'Valor esperado por mês', valor: fmtReais(s.valor) });
              }
            } else linhas.push({ rotulo: 'Modelo', valor: 'Não treinado' });
          } else if (it.tipo === 'agrupamento') {
            var m = g.modelo;
            if (m && m.k) {
              linhas.push({ rotulo: 'Número de grupos', valor: m.k + ' grupos, silhueta de ' + fmtAuc(m.valorTreino) });
              (m.perfis[m.k] || []).forEach(function (p) { linhas.push({ rotulo: p.nome + ' (' + fmtInt(p.n) + ')', valor: p.tracos.join('; ') + '. Desvio médio de prazo: ' + p.desvio }); });
            } else linhas.push({ rotulo: 'Agrupamento', valor: 'Não executado' });
          }
        });
        if (f.id === 'evento' && g.modelo) { var rm = resumoModelo(g.modelo, true); linhas.unshift({ rotulo: rm.rotuloProducao, valor: rm.producao }); }
        secoes.push({ titulo: f.titulo, linhas: linhas });
      });
      return { grupo: g.nome, caso: caso.titulo, empresa: caso.empresa, secoes: secoes };
    }

    function eventoVisao(caso, g) {
      if (!g.modelo || !caso._evento) return null;
      var ev = caso._evento[g.modelo.cenario];
      var m = g.modelo, rm = resumoModelo(m, true);
      function sub(s) {
        return s.replace('{aucValidacao}', fmtAuc(m.aucValidacao || 0)).replace('{aucProducao}', fmtAuc(m.aucProducao || 0))
          .replace('{valorTreino}', fmtAuc(m.valorTreino || 0)).replace('{valorProducao}', fmtAuc(m.valorProducao || 0))
          .replace('{notaComite}', fmt1((m.valorProducao || 0) * 10))
          .replace('{colunasVazamento}', m.flags.vazamento.join(', ')).replace('{colunasCirculares}', m.flags.circular.join(', '));
      }
      var c = campanha(caso, g);
      return { titulo: ev.titulo, mensagem: sub(ev.mensagem), evidencias: ev.evidencias.map(sub),
        antes: { rotulo: rm.rotuloTreino, valor: rm.treino }, depois: { rotulo: rm.rotuloProducao, valor: rm.producao },
        campanha: c ? { pct: c.pct, prometido: c.prometido, real: c.real } : null };
    }

    /* Textos curtos da métrica, iguais em todas as telas. */
    function resumoModelo(m, comProducao) {
      if (!m) return null;
      if (m.tipo === 'agrupamento') return {
        rotuloTreino: 'Silhueta dos grupos', treino: m.valorTreino == null ? 'sem agrupamento' : fmtAuc(m.valorTreino),
        rotuloProducao: 'Nota do comitê para as trilhas', producao: comProducao && m.valorProducao != null ? fmt1(m.valorProducao * 10) + ' de 10' : null,
        curtoTreino: m.valorTreino == null ? null : 'silhueta ' + fmtAuc(m.valorTreino), curtoProducao: comProducao && m.valorProducao != null ? 'comitê ' + fmt1(m.valorProducao * 10) + '/10' : null
      };
      return {
        rotuloTreino: 'AUC no teste', treino: fmtAuc(m.aucValidacao), rotuloProducao: 'AUC em produção', producao: comProducao ? fmtAuc(m.aucProducao) : null,
        curtoTreino: 'AUC ' + fmtAuc(m.aucValidacao), curtoProducao: comProducao ? 'AUC ' + fmtAuc(m.aucProducao) : null
      };
    }

    function revelacaoGrupo(caso, g) {
      var fases = [];
      caso.fases.forEach(function (f) {
        var resp = respostasDe(g, f.id), env = g.enviadas[f.id], itens = [];
        f.itens.forEach(function (it) {
          var r = resp[it.id], pts = env && env.det ? env.det[it.id] : 0, x = { id: it.id, tipo: it.tipo, enunciado: it.enunciado, pontos: pts || 0, max: it.pontosMax || 0 };
          if (it.tipo === 'escolha') {
            var gab = gabaritoEscolha(caso, f.id, it, g) || {};
            x.sua = textoOpcao(it, r) || 'Sem resposta'; x.correta = textoOpcao(it, melhorOpcao(gab));
            x.explicacao = it._explicacao || (f.id === 'evento' && g.modelo ? caso._evento[g.modelo.cenario]._explicacao : '');
          } else if (it.tipo === 'cartas') {
            x.cartas = it.cartas.map(function (c) {
              var sua = achar(caso.caixas, r && r[c.id]), cor = achar(caso.caixas, c._gabarito);
              return { nome: c.nome, sua: sua ? sua.nome : 'Sem caixa', correta: cor.nome, ok: !!(r && r[c.id] === c._gabarito), explicacao: c._explicacao };
            });
          } else if (it.tipo === 'mercado') {
            x.fontes = it.fontes.map(function (fo) { return { nome: fo.nome, comprou: g.compras.indexOf(fo.id) >= 0, pontos: fo._gabarito.pontos, explicacao: fo._explicacao }; });
          } else if (it.tipo === 'simulador') {
            if (g.modelo) {
              var o = Stats.otimo(g.modelo.aucValidacao, caso.simulador);
              x.sua = r && r.pct ? String(r.pct).replace('.', ',') + '%' : 'Sem resposta';
              x.correta = String(o.pct).replace('.', ',') + '% (valor esperado de ' + fmtReais(o.valor) + ' por mês)';
              x.explicacao = 'Abordar mais clientes só compensa enquanto a precisão da lista paga o custo de cada abordagem.';
            }
          } else if (it.tipo === 'agrupamento') {
            x.sua = r && r.k ? r.k + ' grupos' + (g.modelo && g.modelo.cenario === 'escala' ? ', com as variáveis sem padronizar' : '') : 'Sem resposta';
            x.correta = melhorOpcao(it._gabarito) + ' grupos, com as variáveis padronizadas';
            x.explicacao = it._explicacao;
          } else if (it.tipo === 'texto') x.sua = limpar(r, 500);
          itens.push(x);
        });
        fases.push({ id: f.id, titulo: f.titulo, pontos: env ? env.pontos : 0, itens: itens });
      });
      return { armadilha: caso._revelacao, fases: fases, modelo: g.modelo };
    }

    function ranking() {
      var gs = todosGrupos();
      gs.sort(function (a, b) { return total(b) - total(a); });
      return gs;
    }

    function visaoModelo(m, comProducao) {
      if (!m) return null;
      if (m.tipo === 'agrupamento') {
        var v = { tipo: m.tipo, base: m.base, silhuetas: m.silhuetas, perfis: m.perfis, nFeatures: m.nFeatures, k: m.k, valorTreino: m.valorTreino };
        if (comProducao) v.valorProducao = m.valorProducao;
        return v;
      }
      var s = { tipo: 'supervisionado', base: m.base, aucValidacao: m.aucValidacao, acuracia: m.acuracia, acuraciaIngenua: m.acuraciaIngenua, divisao: m.divisao, nFeatures: m.nFeatures };
      if (comProducao) s.aucProducao = m.aucProducao;
      return s;
    }

    function visaoGrupo(g, glob) {
      var caso = casos[g.caso], fid = FASES[glob.fase], gs = ranking(), pos = 0;
      for (var i = 0; i < gs.length; i++) if (gs[i].codigo === g.codigo) pos = i + 1;
      var dicas = [];
      caso.fases.forEach(function (f) { (f.dicas || []).forEach(function (d) { if (g.dicas.indexOf(d.id) >= 0) dicas.push({ id: d.id, fase: f.id, titulo: d.titulo, texto: d._texto }); }); });
      var enviadas = {};
      for (var k in g.enviadas) enviadas[k] = { respostas: g.enviadas[k].respostas, pontos: g.enviadas[k].pontos, ts: g.enviadas[k].ts, automatico: g.enviadas[k].automatico, rapido: g.enviadas[k].rapido };
      var modelo = visaoModelo(g.modelo, glob.fase >= 4);
      return {
        agora: agora(), fase: glob.fase, faseId: fid, faseTitulo: TITULOS_FASE[glob.fase], prazo: glob.prazo,
        sorteio: glob.sorteio && glob.sorteio.codigo === g.codigo ? { membro: glob.sorteio.membro, ts: glob.sorteio.ts } : null,
        grupo: {
          codigo: g.codigo, nome: g.nome, caso: g.caso, membros: g.membros, creditos: g.creditos, compras: g.compras, dicas: dicas,
          rascunhos: g.rascunhos, enviadas: enviadas, pontos: g.pontos, bonusCreditos: Math.floor(Math.max(0, g.creditos) / 10),
          total: total(g), posicao: pos, totalGrupos: gs.length, modelo: modelo
        },
        evento: glob.fase >= 4 ? eventoVisao(caso, g) : null,
        ficha: glob.fase >= 5 ? ficha(caso, g) : null,
        revelacao: glob.fase >= 6 ? revelacaoGrupo(caso, g) : null
      };
    }

    function visaoPlacar(glob) {
      var gs = ranking();
      var grupos = gs.map(function (g, i) {
        var caso = casos[g.caso], status = {};
        ['f1', 'f2', 'f3', 'evento'].forEach(function (f) { status[f] = g.enviadas[f] ? (g.enviadas[f].automatico ? 'tempo' : 'enviado') : (g.rascunhos[f] ? 'rascunho' : ''); });
        return {
          id: 'p' + (cfg.grupos.map(function (c) { return normCodigo(c.codigo); }).indexOf(g.codigo) + 1),
          posicao: i + 1, nome: g.nome, caso: caso.titulo, setor: caso.setor, membros: g.membros.length, status: status,
          total: total(g), pontos: g.pontos, bonusCreditos: Math.floor(Math.max(0, g.creditos) / 10),
          online: online(g.codigo),
          metrica: g.modelo && g.enviadas.f3 ? (function () { var rm = resumoModelo(g.modelo, glob.fase >= 4); return { treino: rm.curtoTreino, producao: rm.curtoProducao }; })() : null
        };
      });
      var out = { agora: agora(), fase: glob.fase, faseTitulo: TITULOS_FASE[glob.fase], prazo: glob.prazo, grupos: grupos, feed: glob.feed.slice(-12) };
      if (glob.sorteio) out.sorteio = { grupo: glob.sorteio.nome, membro: glob.sorteio.membro, ts: glob.sorteio.ts };
      if (glob.projetar) { var gp = lerGrupo(glob.projetar); if (gp && glob.fase >= 5) out.ficha = ficha(casos[gp.caso], gp); }
      if (glob.fase >= 6) {
        var vistos = {};
        out.revelacoes = [];
        cfg.grupos.forEach(function (c) {
          if (vistos[c.caso] || !casos[c.caso]) return; vistos[c.caso] = 1;
          var cs = casos[c.caso];
          out.revelacoes.push({ caso: cs.titulo, setor: cs.setor, grupos: cfg.grupos.filter(function (x) { return x.caso === c.caso; }).map(function (x) { return x.nome; }), armadilha: cs._revelacao });
        });
      }
      return out;
    }

    function visaoProfessor(glob) {
      var gs = ranking().map(function (g) {
        return {
          codigo: g.codigo, nome: g.nome, caso: g.caso, casoTitulo: casos[g.caso].titulo, membros: g.membros, creditos: g.creditos,
          compras: g.compras, dicas: g.dicas, pontos: g.pontos, total: total(g), bonusCreditos: Math.floor(Math.max(0, g.creditos) / 10),
          enviadas: g.enviadas, rascunhos: g.rascunhos, modelo: g.modelo, resumo: resumoModelo(g.modelo, glob.fase >= 4), telemetria: g.telemetria,
          online: online(g.codigo), visto: store.get('v:' + g.codigo)
        };
      });
      var semEntrar = cfg.grupos.filter(function (c) { return !lerGrupo(c.codigo); }).map(function (c) { return { codigo: normCodigo(c.codigo), nome: c.nome, caso: c.caso }; });
      return { agora: agora(), global: glob, faseTitulo: TITULOS_FASE[glob.fase], titulosFase: TITULOS_FASE, grupos: gs, semEntrar: semEntrar, duracoes: duracoes };
    }

    function exportar() {
      var linhas = [], cols = ['Grupo', 'Código', 'Caso', 'Membros', 'Total', 'F1', 'F2', 'F3', 'Evento', 'Desempenho', 'Velocidade', 'Bônus créditos', 'Créditos restantes', 'Métrica no treino', 'Métrica em produção', 'Vazamento usado', 'Agrupamento circular', 'Sensível usado', 'Comprou redes sociais', 'Saídas da aba', 'Tempo fora (min)', 'Colagens', 'Caracteres colados', 'Inserções grandes'];
      var primeiro = casos[cfg.grupos[0].caso];
      // Colunas por posição do item na fase, para casos diferentes caberem na mesma planilha
      var posicoes = [];
      primeiro.fases.forEach(function (f) { f.itens.forEach(function (it, i) { if (it.tipo !== 'cartas' && it.tipo !== 'mercado') { posicoes.push([f.id, i]); cols.push(f.id + ' / item ' + (i + 1)); } }); });
      ranking().forEach(function (g) {
        var caso = casos[g.caso], m = g.modelo, t = g.telemetria;
        var l = [g.nome, g.codigo, caso.titulo, g.membros.join('; '), total(g), g.pontos.f1, g.pontos.f2, g.pontos.f3, g.pontos.evento, g.pontos.desempenho, g.pontos.velocidade, Math.floor(Math.max(0, g.creditos) / 10), g.creditos,
          m ? resumoModelo(m, true).curtoTreino || '' : '', m ? resumoModelo(m, true).curtoProducao || '' : '', m ? m.flags.vazamento.join(', ') : '', m ? m.flags.circular.join(', ') : '', m ? m.flags.sensivel.join(', ') : '', m && m.flags.redes ? 'sim' : 'não',
          t.saidas, Math.round(t.tempoForaMs / 6000) / 10, t.colagens, t.charsColados, t.insercoesGrandes];
        posicoes.forEach(function (pos) {
          var f = faseCaso(caso, pos[0]), it = f && f.itens[pos[1]], v = '';
          if (it) {
            var r = respostasDe(g, f.id)[it.id];
            if (it.tipo === 'escolha') v = it.rotulo + ': ' + (textoOpcao(it, r) || '');
            else if (it.tipo === 'texto') v = limpar(r, 500);
            else if (it.tipo === 'simulador') v = r && r.pct ? 'Abordar ' + r.pct + '%' : '';
            else if (it.tipo === 'agrupamento') v = r && r.k ? r.k + ' grupos' : '';
          }
          l.push(v);
        });
        linhas.push(l);
      });
      return { colunas: cols, linhas: linhas };
    }

    /* ---------- Ações ---------- */
    function exigirGrupo(req) {
      var c = cfgGrupo(req.codigo);
      if (!c) throw new Error('Código de grupo não encontrado.');
      var g = lerGrupo(c.codigo);
      if (!g) throw new Error('Entre no jogo de novo com o código do grupo.');
      return g;
    }
    function exigirFaseAberta(glob, faseId, g) {
      if (FASES[glob.fase] !== faseId) throw new Error('Esta fase não está aberta.');
      if (g.enviadas[faseId]) throw new Error('Esta fase já foi enviada.');
    }

    var acoes = {
      entrar: function (req) {
        var c = cfgGrupo(req.codigo);
        if (!c) throw new Error('Código de grupo não encontrado. Confira com o professor.');
        if (!casos[c.caso]) throw new Error('O caso deste grupo ainda não está disponível.');
        var glob = lerGlobal(), g = lerGrupo(c.codigo), novo = !g;
        if (novo) g = novoGrupo(c);
        (req.membros || []).forEach(function (m) {
          var n = limpar(m, 60);
          if (n && g.membros.length < 10 && g.membros.map(function (x) { return x.toLowerCase(); }).indexOf(n.toLowerCase()) < 0) g.membros.push(n);
        });
        salvarGrupo(g); marcarVisto(g.codigo);
        if (novo) { feed(glob, g.nome + ' entrou no jogo', 'entrada'); salvarGlobal(glob); }
        return { codigo: g.codigo, nome: g.nome, caso: g.caso, membros: g.membros };
      },
      estado: function (req) {
        var g = exigirGrupo(req), glob = lerGlobal();
        marcarVisto(g.codigo);
        return visaoGrupo(g, glob);
      },
      salvar: function (req) {
        var g = exigirGrupo(req), glob = lerGlobal();
        aplicarTelemetria(g, req.telemetria);
        var fid = req.faseId;
        if (fid && FASES[glob.fase] === fid && !g.enviadas[fid] && req.respostas && typeof req.respostas === 'object') g.rascunhos[fid] = req.respostas;
        salvarGrupo(g); marcarVisto(g.codigo);
        return { ok: true, agora: agora() };
      },
      enviar: function (req) {
        var g = exigirGrupo(req), glob = lerGlobal(), caso = casos[g.caso];
        aplicarTelemetria(g, req.telemetria);
        exigirFaseAberta(glob, req.faseId, g);
        if (!JOGAVEIS[req.faseId]) throw new Error('Esta fase não recebe respostas.');
        var e = enviarFase(g, caso, glob, req.faseId, req.respostas || {}, false);
        salvarGrupo(g); salvarGlobal(glob);
        return { ok: true, pontos: e.pontos, rapido: e.rapido };
      },
      comprar: function (req) {
        var g = exigirGrupo(req), glob = lerGlobal(), caso = casos[g.caso];
        var merc = itemPorTipo(caso, 'mercado');
        if (!merc) throw new Error('Este caso não tem mercado de dados.');
        exigirFaseAberta(glob, merc.fase.id, g);
        var f = achar(merc.item.fontes, req.fonteId);
        if (!f) throw new Error('Fonte não encontrada.');
        if (g.compras.indexOf(f.id) >= 0) throw new Error('Vocês já compraram esta fonte.');
        if (g.creditos < f.custo) throw new Error('Créditos insuficientes.');
        g.creditos -= f.custo; g.compras.push(f.id);
        salvarGrupo(g);
        return { ok: true, creditos: g.creditos, compras: g.compras };
      },
      dica: function (req) {
        var g = exigirGrupo(req), glob = lerGlobal(), caso = casos[g.caso], fid = FASES[glob.fase];
        var fase = faseCaso(caso, fid);
        if (!fase || g.enviadas[fid]) throw new Error('Não há dicas disponíveis agora.');
        var d = achar(fase.dicas, req.dicaId);
        if (!d) throw new Error('Dica não encontrada nesta fase.');
        if (g.dicas.indexOf(d.id) < 0) {
          if (g.creditos < d.custo) throw new Error('Créditos insuficientes.');
          g.creditos -= d.custo; g.dicas.push(d.id); salvarGrupo(g);
        }
        return { ok: true, creditos: g.creditos, dica: { id: d.id, titulo: d.titulo, texto: d._texto } };
      },
      treinar: function (req) {
        var g = exigirGrupo(req), glob = lerGlobal(), caso = casos[g.caso];
        exigirFaseAberta(glob, 'f3', g);
        if (req.respostas && typeof req.respostas === 'object') g.rascunhos.f3 = req.respostas;
        g.modelo = calcularModelo(caso, g);
        salvarGrupo(g);
        return { ok: true, modelo: visaoModelo(g.modelo, false) };
      },

      /* Professor */
      prof_estado: function () { return visaoProfessor(lerGlobal()); },
      prof_placar: function () { return visaoPlacar(lerGlobal()); },
      prof_grupo: function (req) {
        var g = lerGrupo(req.codigo);
        if (!g) throw new Error('Este grupo ainda não entrou no jogo.');
        var v = visaoGrupo(g, lerGlobal());
        v.espiando = true;
        return v;
      },
      prof_fase: function (req) {
        var glob = lerGlobal(), antiga = glob.fase, nova = Math.max(0, Math.min(6, parseInt(req.fase, 10) || 0));
        if (nova === antiga) return visaoProfessor(glob);
        var fAnt = FASES[antiga];
        var gs = todosGrupos();
        if (JOGAVEIS[fAnt]) gs.forEach(function (g) {
          if (!g.enviadas[fAnt]) { enviarFase(g, casos[g.caso], glob, fAnt, g.rascunhos[fAnt] || {}, true); salvarGrupo(g); }
        });
        var fNova = FASES[nova];
        glob.fase = nova; glob.aberta = agora();
        glob.prazo = JOGAVEIS[fNova] ? agora() + (duracoes[fNova] || 6) * 60000 : null;
        if (fNova === 'pitch') { glob.sorteio = null; glob.projetar = null; }
        feed(glob, 'Fase aberta: ' + TITULOS_FASE[nova], 'fase');
        if (fNova === 'evento') gs.forEach(function (g) {
          var caso = casos[g.caso];
          if (!g.modelo) g.modelo = calcularModelo(caso, g);
          g.pontos.desempenho = bonusDesempenho(g.modelo, 'producao');
          var camp = reavaliarCampanha(caso, g), m = g.modelo, txt, tipo;
          if (m.tipo === 'agrupamento') {
            tipo = m.cenario === 'drift' ? 'drift' : 'queda';
            txt = m.cenario === 'escala' ? g.nome + ': as trilhas eram só faixas de orçamento. O comitê deu nota ' + fmt1(m.valorProducao * 10) + ' de 10'
              : m.cenario === 'circular' ? g.nome + ': os grupos repetiram o P, M e G. O comitê deu nota ' + fmt1(m.valorProducao * 10) + ' de 10'
              : g.nome + ': as trilhas funcionaram, mas projetos novos não cabem em nenhum grupo';
          } else {
            tipo = m.aucValidacao - m.aucProducao >= 0.15 ? 'queda' : 'drift';
            txt = g.nome + ': em produção, a AUC ' + (tipo === 'queda' ? 'despencou' : 'caiu') + ' de ' + fmtAuc(m.aucValidacao) + ' para ' + fmtAuc(m.aucProducao);
            if (camp && camp.real < 0) txt += ' e a campanha passou a dar prejuízo';
          }
          feed(glob, txt, tipo);
          salvarGrupo(g);
        });
        salvarGlobal(glob);
        return visaoProfessor(glob);
      },
      prof_tempo: function (req) {
        var glob = lerGlobal(), min = Number(req.minutos) || 0;
        if (glob.prazo) glob.prazo = Math.max(agora(), glob.prazo + min * 60000);
        salvarGlobal(glob);
        return visaoProfessor(glob);
      },
      prof_sortear: function (req) {
        var glob = lerGlobal(), g = lerGrupo(req.codigo);
        if (!g) throw new Error('Grupo não encontrado.');
        var m = g.membros.length ? g.membros[Math.floor(aleatorio() * g.membros.length)] : 'Nenhum nome cadastrado';
        glob.sorteio = { codigo: g.codigo, nome: g.nome, membro: m, ts: agora() };
        salvarGlobal(glob);
        return visaoProfessor(glob);
      },
      prof_projetar: function (req) {
        var glob = lerGlobal();
        glob.projetar = req.codigo ? normCodigo(req.codigo) : null;
        salvarGlobal(glob);
        return visaoProfessor(glob);
      },
      prof_reiniciar: function () {
        cfg.grupos.forEach(function (c) { store.del('g:' + normCodigo(c.codigo)); store.del('v:' + normCodigo(c.codigo)); });
        store.del('global');
        return visaoProfessor(lerGlobal());
      },
      prof_exportar: function () { return exportar(); }
    };

    /* A planilha pode transformar "020271" em número e perder o zero à esquerda. */
    function senhaConfere(dada, certa) {
      var a = String(dada == null ? '' : dada).trim(), b = String(certa == null ? '' : certa).trim();
      if (!b) return false;
      if (a === b) return true;
      return /^\d+$/.test(a) && /^\d+$/.test(b) && Number(a) === Number(b);
    }
    function handle(req) {
      try {
        req = req || {};
        var a = acoes[req.acao];
        if (!a) throw new Error('Ação desconhecida.');
        if (req.acao.indexOf('prof_') === 0 && !senhaConfere(req.chave, cfg.chaveProfessor)) throw new Error('Senha do professor incorreta.');
        var leitura = { estado: 1, prof_estado: 1, prof_placar: 1, prof_grupo: 1, prof_exportar: 1 }[req.acao];
        return leitura ? a(req) : comTrava(function () { return a(req); });
      } catch (e) {
        return { erro: e && e.message ? e.message : String(e) };
      }
    }
    return { handle: handle, _interno: { calcularModelo: calcularModelo, pontuar: pontuar } };
  }

  return { create: create, FASES: FASES, TITULOS_FASE: TITULOS_FASE };
})();
if (typeof module !== 'undefined') module.exports = ServerCore;


var CASOS = {"tamanho-unico":{"id":"tamanho-unico","exercicio":"ml-nao-supervisionado","titulo":"Tamanho Único","subtitulo":"Governança sob medida para um portfólio que não cabe numa regra só","setor":"Energia, PMO corporativo","empresa":"Corrente Viva Energia","imagem":"img/tamanho-unico.svg","creditosIniciais":100,"briefing":{"remetente":"Paulo Siqueira","cargo":"Diretor do PMO Corporativo, Corrente Viva Energia","assunto":"Chega de governança tamanho único","mensagem":["Pessoal, preciso de uma mão.","Hoje todo projeto da Corrente Viva passa pelo mesmo ritual: comitê mensal, 14 documentos obrigatórios e 5 gates de aprovação. Os projetos pequenos reclamam de burocracia, e os grandes estouram prazo mesmo assim.","Quero usar IA para separar os projetos em trilhas de governança diferentes. Já temos a classificação de porte que o PMO faz há anos (P, M e G). A IA não pode simplesmente aprender com ela e classificar os projetos novos?","O time de dados tem o histórico completo. Preciso de uma proposta para levar à diretoria no mês que vem."],"contexto":[{"titulo":"A empresa","texto":"A Corrente Viva Energia atua em transmissão e distribuição de energia, com obras urbanas, rurais e em áreas de preservação. Os projetos vão de reformas de subestação a linhas de transmissão de centenas de quilômetros."},{"titulo":"O portfólio","texto":"São 340 projetos em andamento e 1.200 concluídos nos últimos 5 anos: 1.540 no total. O orçamento vai de R$ 80 mil a R$ 2,1 bilhões."},{"titulo":"Classificação atual","texto":"O PMO classifica cada projeto como P, M ou G de acordo com o orçamento previsto. Projetos P ficam com 42% do portfólio, M com 37% e G com 21%."},{"titulo":"Relatório da auditoria interna","texto":"No último ano, 62% dos projetos que estouraram o prazo em mais de 30% estavam classificados como P ou M."},{"titulo":"O comitê de governança","texto":"São 9 analistas no PMO. O comitê aceita desenhar trilhas diferentes, mas avisa que não consegue operar muitas ao mesmo tempo."}]},"caixas":[{"id":"agrupar","nome":"Usar para agrupar","ajuda":"Característica do projeto conhecida no início"},{"id":"descrever","nome":"Só para descrever depois","ajuda":"Resultado ou rótulo: serve para comparar os grupos, não para formá-los"},{"id":"sensivel","nome":"Sensível ou proxy","ajuda":"Dado protegido ou substituto de um dado protegido"},{"id":"descartar","nome":"Descartar","ajuda":"Não carrega padrão útil"}],"agrupamento":{"itens":"projetos","item":"projeto","total":1540,"kMin":2,"kMax":6,"rotuloComparacao":"Desvio médio de prazo dos concluídos"},"fases":[{"id":"f1","titulo":"Enquadre o problema","curto":"Enquadre","duracaoMin":6,"missao":"Transformem o pedido do Paulo num problema de machine learning bem formulado. Antes de pensar em dados, decidam que decisão a IA vai apoiar e se existe uma resposta certa para aprender.","itens":[{"id":"f1q1","tipo":"escolha","rotulo":"Decisão apoiada","enunciado":"Qual decisão de negócio a IA vai apoiar?","opcoes":[{"id":"a","texto":"Desenhar trilhas de governança diferentes para grupos de projetos parecidos entre si"},{"id":"b","texto":"Prever quais projetos em andamento vão atrasar"},{"id":"c","texto":"Eliminar o comitê de governança e deixar a IA aprovar os gates"},{"id":"d","texto":"Avaliar o desempenho de cada gerente de projeto"}],"_gabarito":{"a":6,"b":2,"c":0,"d":0},"pontosMax":6,"_explicacao":"O Paulo quer adaptar a governança ao perfil de cada projeto (tailoring, no PMBOK 8, dentro do domínio de Governança). Prever atraso (b) é útil, mas é outra pergunta. Eliminar o comitê (c) e avaliar gerentes (d) fogem do pedido."},{"id":"f1q2","tipo":"escolha","rotulo":"Existe rótulo?","enunciado":"Existe uma resposta certa e confiável para cada projeto, que a IA possa usar como exemplo?","opcoes":[{"id":"a","texto":"Sim: a classificação P, M e G que o PMO já faz"},{"id":"b","texto":"Não: queremos descobrir grupos de projetos que ainda não conhecemos"},{"id":"c","texto":"Sim: a nota de risco que cada gerente dá ao próprio projeto"},{"id":"d","texto":"Sim: se o projeto atrasou ou não"}],"_gabarito":{"a":2,"b":6,"c":1,"d":2},"pontosMax":6,"_explicacao":"A classificação P, M e G existe, mas é justamente o critério que a auditoria mostrou que falha. Ensinar a IA a reproduzi-la só automatizaria o erro. Atrasou ou não (d) é um resultado, não um perfil de governança."},{"id":"f1q3","tipo":"escolha","rotulo":"Tipo de problema","enunciado":"Que tipo de problema é esse?","opcoes":[{"id":"a","texto":"Classificação: ensinar a IA a colocar cada projeto em P, M ou G"},{"id":"b","texto":"Regressão: prever um valor numérico, como o desvio de prazo"},{"id":"c","texto":"Agrupamento (clustering): encontrar grupos de projetos parecidos, sem rótulos"},{"id":"d","texto":"Aprendizado por reforço: a IA testa trilhas e aprende com recompensas"}],"_gabarito":{"a":1,"b":0,"c":5,"d":0},"pontosMax":5,"_explicacao":"Sem uma resposta certa confiável, o caminho é o aprendizado não supervisionado: deixar os dados mostrarem quais projetos se parecem."},{"id":"f1q4","tipo":"escolha","rotulo":"O que agrupar","enunciado":"Quais projetos entram na análise, e descritos por quais informações?","opcoes":[{"id":"a","texto":"Só os projetos que atrasaram, para entender o problema"},{"id":"b","texto":"Todos os 1.540 projetos dos últimos 5 anos, descritos pelas características que se conhece no início de cada um"},{"id":"c","texto":"Os gerentes de projeto, descritos pelo histórico de cada um"},{"id":"d","texto":"Só os 340 projetos em andamento, descritos pelo desempenho atual"}],"_gabarito":{"a":3,"b":8,"c":1,"d":4},"pontosMax":8,"_explicacao":"As trilhas vão ser aplicadas a projetos novos, no início. Então os grupos precisam ser formados com informações que existem no início e com o portfólio inteiro. Só os atrasados (a) dá uma visão parcial; só os ativos (d) usa dados de desempenho que um projeto novo ainda não tem."},{"id":"f1j","tipo":"texto","rotulo":"Por que não usar P, M e G","enunciado":"Em até duas frases: por que não usar a classificação P, M e G como resposta certa?","maxChars":400}],"dicas":[{"id":"f1d1","titulo":"Ligar para o cientista de dados","custo":10,"_texto":"Antes de escolher o tipo de problema, respondam: existe uma resposta certa conhecida para cada projeto? E, se existe, ela é confiável?"},{"id":"f1d2","titulo":"Conversar com a auditoria interna","custo":10,"_texto":"Para nós, o porte em reais não explica o risco. Os projetos que mais estouraram eram baratos, mas tinham dezenas de partes interessadas e licença ambiental pendente."}]},{"id":"f2","titulo":"Monte o dataset","curto":"Dataset","duracaoMin":12,"missao":"O time de dados separou 16 colunas sobre os projetos. Classifiquem cada uma numa das quatro caixas e decidam se vale comprar dados externos. As colunas que forem para \"Usar para agrupar\" são as que a IA vai usar para medir o quanto dois projetos se parecem.","itens":[{"id":"f2cartas","tipo":"cartas","rotulo":"Colunas","enunciado":"Arrastem cada coluna para uma caixa (ou cliquem na coluna e depois na caixa).","pontosPorCarta":2,"pontosMax":32,"cartas":[{"id":"c01","nome":"orcamento_previsto","descricao":"Orçamento aprovado no início do projeto, em reais.","exemplos":["R$ 180.000","R$ 42.000.000","R$ 1.900.000.000"],"_gabarito":"agrupar","_explicacao":"Conhecido no início e relevante. Só precisa ser posto na mesma escala das outras variáveis antes de agrupar."},{"id":"c02","nome":"duracao_prevista_meses","descricao":"Duração planejada no termo de abertura.","exemplos":["4","18","60"],"_gabarito":"agrupar","_explicacao":"Característica conhecida no início e associada à complexidade."},{"id":"c03","nome":"n_stakeholders_chave","descricao":"Número de partes interessadas-chave mapeadas na abertura (prefeituras, comunidades, órgãos, clientes).","exemplos":["3","27","11"],"_gabarito":"agrupar","_explicacao":"Uma das variáveis que mais diferencia os projetos, e que a classificação por porte ignora."},{"id":"c04","nome":"n_fornecedores","descricao":"Número de fornecedores contratados previstos.","exemplos":["1","9","4"],"_gabarito":"agrupar","_explicacao":"Mede a complexidade de aquisições, conhecida no planejamento."},{"id":"c05","nome":"exposicao_regulatoria","descricao":"0 = nenhuma, 1 = exigências da ANEEL, 2 = licenciamento ambiental, 3 = ambos.","exemplos":["0","3","2"],"_gabarito":"agrupar","_explicacao":"Fortemente ligada ao risco do projeto e conhecida desde o início."},{"id":"c06","nome":"grau_novidade_tecnologica","descricao":"De 1 (tecnologia de uso corrente) a 5 (primeira vez na empresa).","exemplos":["1","5","2"],"_gabarito":"agrupar","_explicacao":"Projetos inovadores pedem governança diferente dos de rotina."},{"id":"c07","nome":"n_areas_envolvidas","descricao":"Quantas áreas internas participam do projeto.","exemplos":["1","6","3"],"_gabarito":"agrupar","_explicacao":"Indica necessidade de coordenação, conhecida no início."},{"id":"c08","nome":"dependencias_externas","descricao":"Quantos outros projetos ou obras de terceiros precisam terminar antes de etapas deste.","exemplos":["0","4","1"],"_gabarito":"agrupar","_explicacao":"Mapeada no planejamento e muito ligada a atrasos."},{"id":"c09","nome":"tipo_local","descricao":"Onde a obra acontece: urbano, rural ou área de preservação.","exemplos":["urbano","área de preservação","rural"],"_gabarito":"agrupar","_explicacao":"Característica conhecida no início que muda a natureza do trabalho."},{"id":"c10","nome":"desvio_prazo_final","descricao":"Diferença entre o prazo real e o planejado, apurada no encerramento.","exemplos":["+4%","+52%","-2%"],"_gabarito":"descrever","_explicacao":"É um resultado: só existe no fim e não existe para projetos novos. Serve para comparar os grupos depois (os grupos atrasam de forma diferente?), não para formá-los."},{"id":"c11","nome":"classificacao_porte_pmo","descricao":"Classificação P, M ou G feita pelo PMO com base no orçamento.","exemplos":["P","G","M"],"_gabarito":"descrever","_explicacao":"É o critério que se quer substituir. Usada para agrupar, puxa os grupos de volta para P, M e G. Serve para comparar: os grupos novos cortam a classificação antiga de outro jeito?"},{"id":"c12","nome":"satisfacao_patrocinador","descricao":"Nota de 0 a 10 dada pelo patrocinador no encerramento.","exemplos":["9","4","7"],"_gabarito":"descrever","_explicacao":"Resultado do projeto, conhecido só no fim. Útil para avaliar os grupos depois."},{"id":"c13","nome":"idade_gerente","descricao":"Idade do gerente responsável pelo projeto.","exemplos":["34","51","42"],"_gabarito":"sensivel","_explicacao":"Descreve uma pessoa, não o projeto. Usar a idade para definir a governança pode virar discriminação por idade."},{"id":"c14","nome":"genero_gerente","descricao":"Gênero do gerente responsável, conforme cadastro de RH.","exemplos":["feminino","masculino","feminino"],"_gabarito":"sensivel","_explicacao":"Dado pessoal que nada diz sobre o projeto e pode levar a tratamento discriminatório."},{"id":"c15","nome":"codigo_projeto","descricao":"Código do projeto no sistema de gestão de portfólio.","exemplos":["TR-2021-0448","DS-2024-1102","SE-2022-0090"],"_gabarito":"descartar","_explicacao":"Identificador sem significado para a semelhança entre projetos."},{"id":"c16","nome":"moeda_contrato","descricao":"Moeda dos contratos do projeto. Desde 2020 a Corrente Viva só contrata em reais.","exemplos":["BRL","BRL","BRL"],"_gabarito":"descartar","_explicacao":"Mesmo valor para todos os projetos: não ajuda a distinguir ninguém."}]},{"id":"f2mercado","tipo":"mercado","rotulo":"Dados externos comprados","enunciado":"Mercado de dados: fontes externas que podem ser compradas com créditos. A compra é imediata e não tem devolução.","pontosMax":8,"fontes":[{"id":"m1","nome":"Prazos de licenciamento ambiental","descricao":"Prazo médio de emissão de licenças pelo órgão estadual, por região e tipo de obra.","custo":30,"_gabarito":{"pontos":4,"auc":0.02},"_explicacao":"Acrescenta uma dimensão de risco que os dados internos medem mal."},{"id":"m2","nome":"Histórico de fiscalização da ANEEL","descricao":"Autuações e exigências da ANEEL por tipo de obra nos últimos 10 anos.","custo":20,"_gabarito":{"pontos":4,"auc":0.02},"_explicacao":"Detalha a exposição regulatória, uma das variáveis que mais separa os grupos."},{"id":"m3","nome":"Cotação diária do dólar","descricao":"Série histórica do câmbio real e dólar.","custo":15,"_gabarito":{"pontos":0,"auc":0},"_explicacao":"Os contratos são todos em reais: o câmbio não diferencia os projetos."},{"id":"m4","nome":"Perfis profissionais dos gerentes","descricao":"Histórico de carreira dos gerentes de projeto, coletado de redes profissionais por uma empresa de dados.","custo":25,"_gabarito":{"pontos":-4,"auc":0,"flag":"redes"},"_explicacao":"Descreve pessoas, não projetos, e foi coletado sem consentimento para essa finalidade."}]}],"dicas":[{"id":"f2d1","titulo":"Perguntar ao analista do PMO","custo":10,"_texto":"Algumas colunas só existem quando o projeto termina. E uma delas é exatamente a classificação que a diretoria quer substituir. Para cada coluna, perguntem: ela descreve o projeto no início, ou é um resultado ou um rótulo dele?"},{"id":"f2d2","titulo":"Consultar o Jurídico","custo":10,"_texto":"Dados pessoais dos gerentes não descrevem o projeto. Usá-los para decidir a governança pode virar decisão discriminatória sobre pessoas."}]},{"id":"f3","titulo":"Agrupe e avalie","curto":"Agrupamento","duracaoMin":8,"missao":"Hora de agrupar. Decidam como preparar as variáveis, como avaliar os grupos e em quantos grupos dividir o portfólio.","explicacao":{"titulo":"Como o agrupamento funciona","passos":[{"titulo":"Preparar as variáveis","texto":"O algoritmo usa as colunas que vocês colocaram em \"Usar para agrupar\". Antes de rodar, é preciso decidir se elas entram como estão ou se passam por algum ajuste."},{"titulo":"Medir semelhança","texto":"Para o algoritmo, dois projetos são parecidos quando estão perto um do outro. A distância é calculada somando as diferenças entre os dois projetos em cada variável."},{"titulo":"Escolher quantos grupos","texto":"O k-means, o algoritmo mais usado, precisa que alguém diga quantos grupos (k) procurar. Ele não sabe sozinho qual é o número certo."},{"titulo":"Avaliar e dar nome","texto":"Não existe gabarito para conferir. Os grupos são avaliados pela separação entre eles e, principalmente, pelo sentido que fazem para quem vai usá-los."}]},"itens":[{"id":"f3q1","tipo":"escolha","rotulo":"Preparação das variáveis","enunciado":"O orçamento vai de R$ 80 mil a R$ 2,1 bilhões. O número de partes interessadas vai de 2 a 60, e a exposição regulatória vai de 0 a 3. O que fazer antes de agrupar?","entenda":"Pensem em como a distância entre dois projetos é calculada. Comparem: dois projetos que diferem em R$ 10 milhões de orçamento e em 25 partes interessadas. Qual das duas diferenças vai pesar mais numa soma simples?","opcoes":[{"id":"a","texto":"Nada: o algoritmo se ajusta sozinho às unidades de cada coluna"},{"id":"b","texto":"Colocar todas as variáveis numéricas na mesma escala (padronizar) antes de agrupar"},{"id":"c","texto":"Excluir o orçamento, que é a variável com os números maiores"},{"id":"d","texto":"Converter o orçamento de reais para milhões de reais"}],"_gabarito":{"a":0,"b":8,"c":3,"d":1},"pontosMax":8,"_explicacao":"Sem padronizar, uma diferença de milhões de reais engole qualquer diferença de 25 partes interessadas, e o agrupamento vira uma ordenação por orçamento. Excluir o orçamento (c) joga fora informação útil. Converter para milhões (d) só troca a unidade e o orçamento ainda domina."},{"id":"f3q2","tipo":"escolha","rotulo":"Como avaliar","enunciado":"Como saber se os grupos encontrados são bons?","entenda":"No agrupamento não há resposta certa para conferir, então não existe acurácia. A silhueta, de -1 a 1, mede o quanto cada projeto está mais perto do próprio grupo do que dos outros: perto de 1, grupos bem separados; perto de 0, grupos misturados.","opcoes":[{"id":"a","texto":"Pela acurácia: o percentual de projetos colocados no grupo certo"},{"id":"b","texto":"Pela separação entre os grupos (silhueta) e, principalmente, se cada grupo tem um perfil claro e pede uma governança diferente"},{"id":"c","texto":"Quanto mais grupos, mais detalhada e melhor a análise"},{"id":"d","texto":"Pela maior silhueta possível, sem olhar o que há dentro dos grupos"}],"_gabarito":{"a":0,"b":7,"c":0,"d":2},"pontosMax":7,"_explicacao":"Silhueta ajuda, mas grupos só valem se forem interpretáveis e acionáveis. Silhueta alta sozinha (d) pode esconder grupos separados por uma única variável."},{"id":"f3grupos","tipo":"agrupamento","rotulo":"Agrupamento","dependeDe":"f3q1","enunciado":"Rodem o agrupamento e escolham em quantos grupos dividir o portfólio. Para cada número de grupos, vejam a silhueta e o perfil de cada grupo.","_gabarito":{"2":2,"3":6,"4":10,"5":8,"6":3},"pontosMax":10,"_explicacao":"Com as variáveis padronizadas, 4 grupos têm a melhor silhueta, perfis claros e cabem no que o comitê consegue operar. Com 2 ou 3, grupos com riscos diferentes ficam misturados; com 6, surgem grupos quase iguais."},{"id":"f3j","tipo":"texto","rotulo":"Confiança nos grupos","enunciado":"Em até duas frases: os grupos encontrados fazem sentido para o PMO? Por quê?","maxChars":400}],"dicas":[{"id":"f3d1","titulo":"Ligar para o cientista de dados","custo":10,"_texto":"Olhem a faixa de valores de cada variável antes de rodar. E desconfiem de silhueta muito alta: grupos muito bem separados podem estar separados por uma coisa só."},{"id":"f3d2","titulo":"Falar com o comitê de governança","custo":10,"_texto":"Conseguimos operar no máximo 4 ou 5 trilhas diferentes. Com menos que isso, voltamos ao tamanho único na prática."}]},{"id":"evento","titulo":"Seis meses depois","curto":"Produção","duracaoMin":6,"missao":"As trilhas de governança baseadas nos grupos de vocês estão em uso há seis meses. O Paulo chama a equipe para uma conversa difícil.","itens":[{"id":"evq1","tipo":"escolha","rotulo":"Diagnóstico","enunciado":"Qual é o diagnóstico mais provável?","opcoes":[{"id":"a","texto":"Uma variável dominou o cálculo de distância por causa da escala"},{"id":"b","texto":"O agrupamento usou como entrada a classificação ou os resultados que deveria explicar"},{"id":"c","texto":"O portfólio mudou: chegaram projetos de um tipo que não existia nos dados"},{"id":"d","texto":"O número de grupos foi pequeno demais"}],"pontosMax":6},{"id":"evq2","tipo":"escolha","rotulo":"Ação","enunciado":"O que fazer agora?","opcoes":[{"id":"a","texto":"Padronizar as variáveis e rodar o agrupamento de novo"},{"id":"b","texto":"Tirar a classificação e os resultados das variáveis de agrupamento e usá-los só para comparar os grupos depois"},{"id":"c","texto":"Refazer o agrupamento periodicamente e criar uma trilha provisória para projetos fora do padrão"},{"id":"d","texto":"Voltar para a governança única, que pelo menos era simples"}],"pontosMax":4},{"id":"evj","tipo":"texto","rotulo":"O que faltou antes","enunciado":"Em até duas frases: o que a equipe deveria ter verificado antes de levar os grupos para a diretoria?","maxChars":400}],"dicas":[]}],"_modelo":{"tipo":"agrupamento","padroniza":{"item":"f3q1","respostas":["b"]},"pesoCarta":{"c03":0.04,"c05":0.04,"padrao":0.015},"ruido":-0.03,"silhueta":{"drift":{"2":0.38,"3":0.46,"4":0.53,"5":0.47,"6":0.39},"circular":{"2":0.44,"3":0.62,"4":0.49,"5":0.43,"6":0.37},"escala":{"2":0.86,"3":0.81,"4":0.77,"5":0.73,"6":0.69}},"producao":{"escala":0.14,"circular":0.3,"drift":0.72},"fatorProducao":{"escala":0,"circular":0.5,"drift":1},"perfis":{"2":[{"nome":"Rotina e inovação","n":913,"tracos":["Poucas partes interessadas (2 a 9)","Pouca ou nenhuma exposição regulatória","Tecnologia variada"],"desvio":"+11%"},{"nome":"Expostos e grandes","n":627,"tracos":["Muitas partes interessadas (12 a 60)","Licenciamento ambiental ou ANEEL","Orçamentos de todos os tamanhos"],"desvio":"+31%"}],"3":[{"nome":"Obras de rotina","n":612,"tracos":["Orçamento baixo ou médio","2 a 6 partes interessadas, sem exposição regulatória","Tecnologia conhecida, 1 ou 2 áreas"],"desvio":"+6%"},{"nome":"Expostos, pequenos e grandes misturados","n":627,"tracos":["Muitas partes interessadas","Licenciamento ambiental ou ANEEL","Orçamento de R$ 200 mil a R$ 2 bilhões"],"desvio":"+31%"},{"nome":"Inovação","n":301,"tracos":["Grau de novidade 4 ou 5","Muitos fornecedores","Poucas exigências regulatórias"],"desvio":"+22%"}],"4":[{"nome":"Obras de rotina","n":612,"tracos":["Orçamento baixo ou médio","2 a 6 partes interessadas, sem exposição regulatória","Tecnologia conhecida, 1 ou 2 áreas"],"desvio":"+6%"},{"nome":"Pequenos, mas expostos","n":418,"tracos":["Orçamento baixo (quase todos classificados como P ou M)","15 a 40 partes interessadas, obras rurais ou em área de preservação","Licenciamento ambiental e várias dependências externas"],"desvio":"+38%"},{"nome":"Inovação","n":301,"tracos":["Grau de novidade 4 ou 5","Muitos fornecedores","Poucas exigências regulatórias"],"desvio":"+22%"},{"nome":"Grandes empreendimentos","n":209,"tracos":["Orçamento muito alto e duração longa","Muitas áreas e fornecedores","Exposição regulatória alta"],"desvio":"+19%"}],"5":[{"nome":"Rotina urbana","n":350,"tracos":["Perfil de rotina","Obras em área urbana"],"desvio":"+5%"},{"nome":"Rotina rural","n":262,"tracos":["Perfil de rotina","Obras em área rural","Diferem da rotina urbana quase só pelo local"],"desvio":"+7%"},{"nome":"Pequenos, mas expostos","n":418,"tracos":["Orçamento baixo, muitas partes interessadas","Licenciamento ambiental e dependências externas"],"desvio":"+38%"},{"nome":"Inovação","n":301,"tracos":["Grau de novidade 4 ou 5","Muitos fornecedores"],"desvio":"+22%"},{"nome":"Grandes empreendimentos","n":209,"tracos":["Orçamento muito alto e duração longa","Exposição regulatória alta"],"desvio":"+19%"}],"6":[{"nome":"Rotina urbana","n":350,"tracos":["Perfil de rotina","Obras em área urbana"],"desvio":"+5%"},{"nome":"Rotina rural","n":262,"tracos":["Perfil de rotina","Obras em área rural"],"desvio":"+7%"},{"nome":"Pequenos, mas expostos","n":418,"tracos":["Orçamento baixo, muitas partes interessadas","Licenciamento ambiental"],"desvio":"+38%"},{"nome":"Inovação com fornecedor único","n":140,"tracos":["Grau de novidade alto","1 ou 2 fornecedores"],"desvio":"+21%"},{"nome":"Inovação com vários fornecedores","n":161,"tracos":["Grau de novidade alto","3 ou mais fornecedores","Muito parecido com o grupo anterior"],"desvio":"+23%"},{"nome":"Grandes empreendimentos","n":209,"tracos":["Orçamento muito alto e duração longa","Exposição regulatória alta"],"desvio":"+19%"}]},"orcamento":{"min":0.08,"max":2100,"unidade":"milhões"}},"_evento":{"escala":{"titulo":"Os grupos eram só faixas de orçamento","mensagem":"Os grupos de vocês tinham silhueta de {valorTreino}, um resultado excelente no papel. Mas, em seis meses de uso, o comitê deu nota {notaComite} de 10 para as trilhas: elas repetem a regra antiga, projetos baratos na trilha leve e caros na pesada. Os projetos pequenos com dezenas de partes interessadas e licença ambiental continuam estourando.","evidencias":["Ordenando os projetos por orçamento, a divisão entre os grupos coincide em 97% com faixas de valor.","As outras variáveis quase não mudam de um grupo para outro.","A silhueta continua alta, acima de 0,70.","O portfólio de projetos novos tem o mesmo perfil dos anos anteriores."],"_gabarito":{"evq1":{"a":6,"b":1,"c":0,"d":0},"evq2":{"a":4,"b":1,"c":0,"d":0}},"_explicacao":"Sem padronizar, a distância entre dois projetos é quase só a diferença de orçamento. Os grupos ficam muito bem separados, por isso a silhueta alta, mas separados pela única coisa que já se sabia."},"circular":{"titulo":"A IA redescobriu o P, M e G","mensagem":"Os grupos de vocês tinham silhueta de {valorTreino}. Em seis meses, o comitê deu nota {notaComite} de 10 para as trilhas: os grupos se parecem demais com a classificação antiga, e os projetos novos, que ainda não têm resultado apurado, caem nos grupos de forma estranha.","evidencias":["{colunasCirculares} entrou(aram) no cálculo de semelhança entre os projetos.","Com 3 grupos, 88% dos projetos ficam no mesmo grupo do seu porte P, M ou G.","Para os projetos novos, as colunas de resultado ainda estão vazias.","As variáveis numéricas foram padronizadas corretamente."],"_gabarito":{"evq1":{"a":1,"b":6,"c":1,"d":0},"evq2":{"a":0,"b":4,"c":1,"d":0}},"_explicacao":"Usar a classificação antiga ou resultados finais para formar os grupos faz a IA reencontrar o que já estava lá. Essas colunas servem para comparar os grupos depois."},"drift":{"titulo":"Chegou um projeto que não cabe em nenhum grupo","mensagem":"Os grupos de vocês tinham silhueta de {valorTreino} e as trilhas funcionaram: o comitê dá nota {notaComite} de 10 para elas. Mas, nos últimos meses, parte dos projetos novos não se encaixa bem em nenhuma trilha, e o Paulo quer entender por quê.","evidencias":["Nos últimos seis meses entraram 60 projetos de geração solar distribuída, um tipo de obra que a Corrente Viva não fazia antes.","40% desses projetos ficam quase à mesma distância de dois grupos diferentes.","Nenhuma coluna chega vazia ou com valores fora do padrão.","Os projetos antigos continuam bem encaixados nos seus grupos."],"_gabarito":{"evq1":{"a":0,"b":0,"c":6,"d":1},"evq2":{"a":0,"b":0,"c":4,"d":0}},"_explicacao":"Grupos descrevem o portfólio de quando foram calculados. Quando surge um tipo novo de projeto, é hora de refazer o agrupamento e, enquanto isso, ter uma trilha para os casos fora do padrão."}},"_revelacao":{"armadilha":"A escala que engana","resumo":"Sem padronizar as variáveis, o orçamento (em reais, com números enormes) dominou a distância entre os projetos. Os grupos saíram muito bem separados, com silhueta alta, e inúteis: eram só faixas de orçamento.","secundaria":"O agrupamento circular: usar a classificação P, M e G ou resultados finais para formar os grupos faz a IA reencontrar o que já se sabia. Essas colunas servem para descrever e comparar os grupos depois.","licoes":["Sem resposta certa, o problema é de agrupamento, e o valor está em descobrir grupos que ninguém via.","Antes de agrupar, coloquem as variáveis na mesma escala.","Silhueta alta não basta: cada grupo precisa ter um perfil claro e levar a uma ação diferente."]}},"fuga-silenciosa":{"id":"fuga-silenciosa","exercicio":"ml-supervisionado","titulo":"A Fuga Silenciosa","subtitulo":"Prever quem vai deixar o cartão antes que seja tarde","setor":"Banco digital, cartão de crédito","empresa":"Banco Arandu","imagem":"img/fuga-silenciosa.svg","creditosIniciais":100,"briefing":{"remetente":"Marina Couto","cargo":"Diretora de Cartões, Banco Arandu","assunto":"Preciso de IA para segurar nossos clientes","mensagem":["Pessoal, preciso da ajuda de vocês com urgência.","Perdemos uns 230 mil clientes de cartão nos últimos 12 meses. Cada cliente ativo nos dá, em média, R$ 900 de margem por ano, então façam a conta. O Conselho quer um plano em 30 dias.","A ideia é simples: quero uma IA que me diga quem vai cancelar o cartão, para eu fazer uma oferta antes. O pessoal de dados diz que tem tudo na base, mais de 200 colunas por cliente. Já temos até o campo de cancelamento lá.","Vocês me ajudam a desenhar isso? Não preciso de código, preciso saber o que pedir ao time de dados e se dá para confiar no resultado."],"contexto":[{"titulo":"A empresa","texto":"O Banco Arandu é um banco 100% digital, com 2,4 milhões de cartões de crédito ativos e sem anuidade. A receita vem de juros e da tarifa que o banco recebe a cada compra."},{"titulo":"Relatório do BI","texto":"No último ano, o sistema registrou 81 mil cancelamentos formais de cartão, feitos pelo app ou pelo telefone."},{"titulo":"Base de dados","texto":"O time de dados guarda uma foto mensal de cada cliente (uma linha por cliente por mês) desde janeiro de 2025: 18 meses de histórico."},{"titulo":"Campanha de retenção","texto":"Um piloto do ano passado testou uma oferta de cashback de 2% por 3 meses. Cada cliente abordado custou, em média, R$ 40. A oferta convenceu a ficar cerca de 30% dos clientes que iam sair."},{"titulo":"Tamanho do problema","texto":"Em qualquer mês, cerca de 4% dos clientes ativos param de usar o cartão nos 60 dias seguintes."}]},"caixas":[{"id":"feature","nome":"Usar como feature","ajuda":"Informação que existe no momento da previsão e ajuda a prever"},{"id":"vazamento","nome":"Vazamento","ajuda":"Só existe depois que o resultado já aconteceu"},{"id":"sensivel","nome":"Sensível ou proxy","ajuda":"Dado protegido ou substituto de um dado protegido"},{"id":"descartar","nome":"Descartar","ajuda":"Não carrega padrão útil"}],"simulador":{"baseClientes":2400000,"prevalencia":0.04,"custoAcao":40,"valorCliente":900,"taxaSalvamento":0.3,"minPct":1,"maxPct":40,"termos":{"unidade":"clientes","positivos":"iam fugir","negativos":"iam ficar","passado":"fugiu","passadoNeg":"ficou","verbo":"vai fugir","verboPlural":"fogem","vp":"Acerto: a oferta chegou a quem ia fugir","fp":"Desperdício: oferta para quem ia ficar","fn":"Perda: foram embora sem receber oferta","vn":"Acerto: ninguém incomodou quem ia ficar"}},"fases":[{"id":"f1","titulo":"Enquadre o problema","curto":"Enquadre","duracaoMin":6,"missao":"Transformem o pedido da Marina num problema de machine learning bem formulado. Antes de pensar em dados, decidam o que exatamente o modelo vai prever, quando e para quê.","itens":[{"id":"f1q1","tipo":"escolha","rotulo":"Decisão apoiada","enunciado":"Qual decisão de negócio o modelo vai apoiar?","opcoes":[{"id":"a","texto":"Escolher, todo mês, quais clientes recebem a oferta de retenção antes de pararem de usar o cartão"},{"id":"b","texto":"Explicar ao Conselho por que os clientes estão indo embora"},{"id":"c","texto":"Separar os clientes em perfis de comportamento para campanhas de marketing"},{"id":"d","texto":"Estimar quanto de receita o banco vai perder no próximo trimestre"}],"_gabarito":{"a":6,"b":2,"c":0,"d":0},"pontosMax":6,"_explicacao":"A previsão só vale se mudar uma decisão. Aqui a decisão é a quem oferecer o cashback. Explicar causas (b) é diagnóstico, não previsão. Separar perfis sem rótulo (c) é aprendizado não supervisionado. Estimar receita agregada (d) é outro problema."},{"id":"f1q2","tipo":"escolha","rotulo":"Momento da previsão","enunciado":"Em que momento a previsão precisa ser feita?","opcoes":[{"id":"a","texto":"Quando o cliente pede o cancelamento"},{"id":"b","texto":"Uma vez por mês, prevendo quem vai parar de usar o cartão nos 60 dias seguintes"},{"id":"c","texto":"Uma vez por ano, no aniversário do cartão"},{"id":"d","texto":"Na abertura da conta"}],"_gabarito":{"a":0,"b":6,"c":2,"d":0},"pontosMax":6,"_explicacao":"A oferta precisa chegar antes da decisão do cliente, com tempo para agir. No pedido de cancelamento (a) já é tarde. Uma vez por ano (c) deixa a maioria das fugas passar. Na abertura da conta (d) ainda não existe histórico de uso."},{"id":"f1q3","tipo":"escolha","rotulo":"Tipo de problema","enunciado":"Que tipo de problema é esse?","opcoes":[{"id":"a","texto":"Classificação: prever uma classe (vai fugir ou não), com uma probabilidade associada"},{"id":"b","texto":"Regressão: prever um valor numérico, como o gasto do mês seguinte"},{"id":"c","texto":"Agrupamento: descobrir grupos de clientes parecidos, sem rótulos"},{"id":"d","texto":"Aprendizado por reforço: o sistema aprende testando ofertas e recebendo recompensa"}],"_gabarito":{"a":5,"b":1,"c":0,"d":0},"pontosMax":5,"_explicacao":"O que se quer saber é se o cliente vai ou não parar de usar o cartão: uma classe binária, com uma probabilidade que permite ordenar os clientes por risco."},{"id":"f1q4","tipo":"escolha","rotulo":"Variável-alvo","enunciado":"Qual deve ser a variável-alvo (o rótulo que o modelo aprende a prever)?","opcoes":[{"id":"a","texto":"Cancelou formalmente o cartão (sim ou não)"},{"id":"b","texto":"Ficou sem nenhuma compra nos 60 dias seguintes à data de referência, depois de ter usado o cartão nos 3 meses anteriores (sim ou não)"},{"id":"c","texto":"Deu nota de satisfação menor que 6 na pesquisa do app"},{"id":"d","texto":"Valor gasto no cartão no mês seguinte, em reais"}],"_gabarito":{"a":3,"b":8,"c":0,"d":2},"pontosMax":8,"_explicacao":"O BI registrou 81 mil cancelamentos formais, mas a Marina perdeu 230 mil clientes: só um em cada três avisa que está saindo. O resto simplesmente para de usar o cartão. Usar o campo de cancelamento (a) ensinaria o modelo a enxergar só a ponta do problema. A nota de satisfação (c) mede opinião de quem responde pesquisa, não comportamento. O gasto do mês seguinte (d) é outra pergunta."},{"id":"f1j","tipo":"texto","rotulo":"Por que esse alvo","enunciado":"Em até duas frases: por que esse alvo, e não o campo de cancelamento que a Marina mencionou?","maxChars":400}],"dicas":[{"id":"f1d1","titulo":"Ligar para o cientista de dados","custo":10,"_texto":"Antes de falar em algoritmo, respondam duas perguntas. Quando a previsão vai ser usada, e que informação existe naquele momento? E o que a Marina quer evitar: o pedido de cancelamento ou a perda do cliente?"},{"id":"f1d2","titulo":"Conversar com o time de Retenção","custo":10,"_texto":"A maioria dos clientes que perdemos nunca ligou para cancelar. O cartão continua aberto, só que ninguém usa. Para nós, cliente que não compra é cliente perdido."}]},{"id":"f2","titulo":"Monte o dataset","curto":"Dataset","duracaoMin":12,"missao":"O time de dados separou 16 colunas candidatas. Classifiquem cada uma numa das quatro caixas e decidam se vale comprar dados externos. O dataset que vocês montarem é o que o modelo vai usar.","itens":[{"id":"f2cartas","tipo":"cartas","rotulo":"Colunas","enunciado":"Arrastem cada coluna para uma caixa (ou cliquem na coluna e depois na caixa).","pontosPorCarta":2,"pontosMax":32,"cartas":[{"id":"c01","nome":"id_cliente","descricao":"Identificador único do cliente na base.","exemplos":["88231907","10455321","77310022"],"_gabarito":"descartar","_explicacao":"Um identificador não carrega padrão de comportamento. Usado como feature, deixa o modelo decorar clientes específicos."},{"id":"c02","nome":"meses_relacionamento","descricao":"Há quantos meses o cliente tem o cartão.","exemplos":["4","37","112"],"_gabarito":"feature","_explicacao":"Existe na data de referência e ajuda a prever: clientes novos fogem mais."},{"id":"c03","nome":"limite_credito","descricao":"Limite total do cartão na data de referência.","exemplos":["R$ 1.200","R$ 8.500","R$ 22.000"],"_gabarito":"feature","_explicacao":"Informação disponível e relevante: limite baixo costuma levar o cliente a usar outro cartão."},{"id":"c04","nome":"pct_limite_usado_3m","descricao":"Média do percentual do limite utilizado nos últimos 3 meses.","exemplos":["12%","64%","3%"],"_gabarito":"feature","_explicacao":"Mede o quanto o cartão é o principal do cliente. Disponível e útil."},{"id":"c05","nome":"variacao_gasto_3m_vs_6m","descricao":"Gasto dos últimos 3 meses comparado ao dos 3 meses anteriores.","exemplos":["-72%","+8%","-15%"],"_gabarito":"feature","_explicacao":"Um dos sinais mais fortes: quem está saindo costuma reduzir o uso aos poucos."},{"id":"c06","nome":"dias_sem_transacao","descricao":"Dias desde a última compra no cartão, contados na data de referência.","exemplos":["2","41","19"],"_gabarito":"feature","_explicacao":"Sinal forte e legítimo, porque é medido até a data de referência, antes do período que se quer prever."},{"id":"c07","nome":"categorias_compra_3m","descricao":"Quantas categorias diferentes (mercado, transporte, streaming...) tiveram compras nos últimos 3 meses.","exemplos":["1","7","4"],"_gabarito":"feature","_explicacao":"Quem usa o cartão para muitas coisas está mais preso a ele."},{"id":"c08","nome":"faturas_atraso_12m","descricao":"Faturas pagas com atraso nos últimos 12 meses.","exemplos":["0","3","1"],"_gabarito":"feature","_explicacao":"Histórico disponível e associado a mudança de comportamento."},{"id":"c09","nome":"contatos_sac_90d","descricao":"Contatos com o atendimento (chat, telefone, app) nos 90 dias anteriores à data de referência.","exemplos":["0","5","1"],"_gabarito":"feature","_explicacao":"Medido antes da data de referência, então é legítimo. Muitos contatos costumam indicar insatisfação."},{"id":"c10","nome":"cartao_em_carteira_digital","descricao":"Se o cartão está cadastrado na carteira digital do celular, para pagar por aproximação.","exemplos":["sim","não","sim"],"_gabarito":"feature","_explicacao":"Cartão na carteira digital é cartão do dia a dia. Disponível e útil."},{"id":"c11","nome":"protocolo_cancelamento","descricao":"Se o cliente abriu protocolo de cancelamento. Preenchido pelo atendimento no dia em que o cliente pede para cancelar.","exemplos":["não","sim","não"],"_gabarito":"vazamento","_explicacao":"Só é preenchido quando o cliente já decidiu sair. No momento da previsão, essa coluna está vazia para quem ainda não pediu, e é justamente esse cliente que interessa."},{"id":"c12","nome":"aceitou_oferta_retencao","descricao":"Se o cliente aceitou a contraproposta da equipe de retenção. A equipe só faz contraproposta a quem pede cancelamento.","exemplos":["não","não","sim"],"_gabarito":"vazamento","_explicacao":"Depende de um pedido de cancelamento que ainda não aconteceu no momento da previsão."},{"id":"c13","nome":"gasto_medio_mensal_ano","descricao":"Gasto médio mensal no ano civil (janeiro a dezembro), calculado pelo BI em janeiro do ano seguinte e gravado em todas as linhas daquele ano.","exemplos":["R$ 340","R$ 2.100","R$ 0"],"_gabarito":"vazamento","_explicacao":"O vazamento mais traiçoeiro: a média inclui os meses que vêm depois da data de referência, ou seja, contém o próprio resultado que se quer prever."},{"id":"c14","nome":"cep_residencial","descricao":"CEP do endereço de cobrança.","exemplos":["22071-000","21650-210","04538-133"],"_gabarito":"sensivel","_explicacao":"Funciona como substituto de renda e de raça. Ofertas que mudam conforme o bairro podem virar tratamento discriminatório."},{"id":"c15","nome":"raca_cor_autodeclarada","descricao":"Raça ou cor informada voluntariamente na pesquisa interna de diversidade de clientes, em 2024.","exemplos":["Parda","Branca","Não informado"],"_gabarito":"sensivel","_explicacao":"Dado sensível pela LGPD, coletado para outra finalidade. Usá-lo para decidir quem recebe oferta é risco jurídico e ético."},{"id":"c16","nome":"codigo_agencia","descricao":"Código da agência a que o cliente está vinculado. O Arandu é 100% digital: todos os clientes estão na agência 0001.","exemplos":["0001","0001","0001"],"_gabarito":"descartar","_explicacao":"Tem o mesmo valor para todos os clientes, então não distingue ninguém."}]},{"id":"f2mercado","tipo":"mercado","rotulo":"Dados externos comprados","enunciado":"Mercado de dados: fontes externas que podem ser compradas com créditos. A compra é imediata e não tem devolução.","pontosMax":8,"fontes":[{"id":"m1","nome":"Bureau de crédito","descricao":"Score atualizado e número de consultas de outros bancos ao CPF do cliente nos últimos 30 dias.","custo":30,"_gabarito":{"pontos":4,"auc":0.03},"_explicacao":"Consultas recentes de outros bancos costumam indicar que o cliente está pedindo cartão em outro lugar."},{"id":"m2","nome":"Navegação no app","descricao":"Telas que o cliente visitou no app nos 30 dias anteriores à data de referência.","custo":20,"_gabarito":{"pontos":4,"auc":0.03},"_explicacao":"Visitas à tela de limite, de tarifas ou de cancelamento são sinais precoces, medidos antes da data de referência."},{"id":"m3","nome":"Clima e feriados","descricao":"Temperatura, chuva e calendário de feriados por cidade, dia a dia.","custo":15,"_gabarito":{"pontos":0,"auc":0},"_explicacao":"Útil para prever demanda de loja, irrelevante para a decisão de abandonar um cartão."},{"id":"m4","nome":"Perfis em redes sociais","descricao":"Interesses e conexões dos clientes, de uma empresa que coleta dados de redes sociais.","custo":25,"_gabarito":{"pontos":-4,"auc":0.005,"flag":"redes"},"_explicacao":"Origem duvidosa, sem consentimento dos clientes para essa finalidade. O ganho é mínimo e o risco de LGPD é alto."}]}],"dicas":[{"id":"f2d1","titulo":"Perguntar ao engenheiro de dados","custo":10,"_texto":"Algumas colunas são preenchidas depois que o cliente já decidiu sair. Para cada coluna, perguntem: no dia em que o modelo rodar, essa informação já existe? Atenção especial a campos calculados pelo BI."},{"id":"f2d2","titulo":"Consultar o Jurídico","custo":10,"_texto":"A LGPD trata origem racial como dado sensível, com regras rígidas de uso. E variáveis aparentemente neutras podem funcionar como substitutas de características protegidas."}]},{"id":"f3","titulo":"Treine e avalie","curto":"Treino","duracaoMin":8,"missao":"Hora de treinar. Decidam como separar os dados, como medir o modelo e quantos clientes a campanha deve abordar por mês.","explicacao":{"titulo":"Como o treino funciona","passos":[{"titulo":"Separar os dados","texto":"O modelo aprende com uma parte dos dados (treino) e é testado numa parte que nunca viu (teste). É como estudar por provas antigas e ser avaliado numa prova nova: se a prova nova repetir as questões que caíram no estudo, a nota engana."},{"titulo":"Escolher como medir","texto":"Antes de olhar o resultado, decidam o que significa um modelo bom para este negócio. A medida errada pode aprovar um modelo inútil."},{"titulo":"Treinar e ler o resultado","texto":"O modelo dá a cada cliente uma nota de risco. O teste mostra o quanto essas notas separam quem fugiu de quem ficou."},{"titulo":"Decidir quem abordar","texto":"Com os clientes ordenados do maior para o menor risco, vocês decidem até onde a campanha vai. Cada abordagem custa dinheiro, acerte ou erre."}]},"itens":[{"id":"f3q1","tipo":"escolha","rotulo":"Divisão dos dados","enunciado":"A base tem uma linha por cliente por mês, durante 18 meses. Como separar treino, validação e teste?","entenda":"O teste precisa imitar a situação real em que o modelo vai ser usado. Pensem: quando o banco rodar o modelo, que dados ele terá em mãos, e que período ele estará tentando prever? Lembrem também que o mesmo cliente aparece uma vez por mês na base.","opcoes":[{"id":"a","texto":"Sorteio aleatório das linhas: 70% treino, 15% validação, 15% teste"},{"id":"b","texto":"Por tempo: treinar com os meses mais antigos e validar e testar com os mais recentes"},{"id":"c","texto":"Treinar e testar com todos os dados, para aproveitar ao máximo"},{"id":"d","texto":"Usar só os últimos 3 meses, porque são os mais parecidos com o futuro"}],"_gabarito":{"a":3,"b":8,"c":0,"d":2},"pontosMax":8,"_explicacao":"O modelo vai prever o futuro a partir do passado, e o teste precisa imitar isso. No sorteio aleatório (a), o mesmo cliente aparece no treino e no teste em meses vizinhos, e o resultado fica otimista. Testar com os dados de treino (c) não mede nada. Três meses (d) deixam poucos exemplos de fuga."},{"id":"f3q2","tipo":"escolha","rotulo":"Como avaliar","enunciado":"Só 4% dos clientes fogem. Como avaliar se o modelo é bom?","entenda":"Acurácia é o percentual de acertos no total. Precisão responde: dos clientes que o modelo apontou como fujões, quantos fugiram mesmo? Recall responde: dos clientes que fugiram, quantos o modelo apontou? A AUC resume o quanto o modelo ordena bem os clientes por risco.","opcoes":[{"id":"a","texto":"Pela acurácia: o percentual total de acertos"},{"id":"b","texto":"Pela precisão e pelo recall da classe \"fuga\", olhando a matriz de confusão e a curva ROC (AUC)"},{"id":"c","texto":"Pelo erro médio, em reais"},{"id":"d","texto":"Pelo tempo que o modelo leva para rodar"}],"_gabarito":{"a":0,"b":7,"c":0,"d":0},"pontosMax":7,"_explicacao":"Com 4% de positivos, um modelo que responde \"ninguém vai fugir\" acerta 96% e não serve para nada. O que importa é quantos fujões o modelo encontra (recall) e quantos dos apontados fogem mesmo (precisão)."},{"id":"f3sim","tipo":"simulador","rotulo":"Campanha","enunciado":"Treinem o modelo e decidam qual percentual dos clientes, do maior para o menor risco, a campanha vai abordar por mês.","pontosMax":10,"dependeDe":"f3q1"},{"id":"f3j","tipo":"texto","rotulo":"Confiança no resultado","enunciado":"Em até duas frases: vocês confiam no resultado do treino? Por quê?","maxChars":400}],"dicas":[{"id":"f3d1","titulo":"Ligar para o cientista de dados","custo":10,"_texto":"Cada cliente aparece uma vez por mês na base. Se o mesmo cliente cai no treino e no teste, o modelo cola de si mesmo. E desconfiem de resultado bom demais: em fuga de clientes, AUC acima de 0,90 quase sempre é sintoma de problema nos dados."},{"id":"f3d2","titulo":"Falar com o Financeiro","custo":10,"_texto":"Cada cliente abordado custa R$ 40, fuja ele ou não. Só vale continuar abordando enquanto a chance de acertar um fujão compensar esse custo."}]},{"id":"evento","titulo":"Seis meses em produção","curto":"Produção","duracaoMin":6,"missao":"O modelo de vocês foi para produção. Seis meses depois, a Marina chama a equipe para uma conversa difícil.","itens":[{"id":"evq1","tipo":"escolha","rotulo":"Diagnóstico","enunciado":"Qual é o diagnóstico mais provável?","opcoes":[{"id":"a","texto":"Vazamento de dados: o treino usou informação que não existe no momento da previsão"},{"id":"b","texto":"Drift: o comportamento dos clientes mudou depois do treino"},{"id":"c","texto":"Overfitting: o modelo tem camadas demais e decorou o treino"},{"id":"d","texto":"Erro de rotulagem: o time de dados marcou os rótulos errados"}],"pontosMax":6},{"id":"evq2","tipo":"escolha","rotulo":"Ação","enunciado":"O que fazer agora?","opcoes":[{"id":"a","texto":"Retreinar só com colunas que existem no momento da previsão"},{"id":"b","texto":"Retreinar com os dados mais recentes e monitorar o desempenho todo mês"},{"id":"c","texto":"Trocar por um modelo mais complexo, com mais camadas"},{"id":"d","texto":"Desligar o modelo e voltar a escolher os clientes pela experiência do time"}],"pontosMax":4},{"id":"evj","tipo":"texto","rotulo":"O que faltou antes","enunciado":"Em até duas frases: o que a equipe deveria ter feito antes de ir para produção?","maxChars":400}],"dicas":[]}],"_modelo":{"aucBase":0.78,"pesoFeature":{"c05":0.04,"c06":0.04,"padrao":0.01},"ganhoSensivel":0.005,"ruido":{"validacao":0.01,"producao":-0.02},"vazamento":{"aucValidacao":0.985,"quedaProducao":0.16},"divisao":{"item":"f3q1","inflacao":{"a":0.04,"b":0,"c":0.09,"d":-0.03}},"drift":0.05,"aucMin":0.53,"aucMax":0.995},"_evento":{"vazamento":{"titulo":"O modelo virou uma moeda","mensagem":"No treino, o modelo de vocês chegou a AUC de {aucValidacao}. Seis meses depois, em produção, está em {aucProducao}. A campanha abordou milhares de clientes e quase nenhum dos que fugiram estava na lista. O Conselho quer saber o que aconteceu.","evidencias":["A taxa de fuga real continua em torno de 4% ao mês, como antes.","No monitoramento, {colunasVazamento} chega(m) com o mesmo valor para 100% dos clientes avaliados a cada mês.","No treino, essa(s) mesma(s) coluna(s) apareciam no topo da lista de importância do modelo.","O perfil dos clientes avaliados em produção é parecido com o do treino."],"_gabarito":{"evq1":{"a":6,"b":1,"c":0,"d":0},"evq2":{"a":4,"b":1,"c":0,"d":0}},"_explicacao":"As colunas de vazamento só são preenchidas depois que o cliente decidiu sair. No treino, o modelo aprendeu a ler a resposta. Em produção, a resposta ainda não existe."},"drift":{"titulo":"O mercado mudou","mensagem":"No treino, o modelo de vocês chegou a AUC de {aucValidacao}. Seis meses depois, em produção, está em {aucProducao}. Ainda funciona, mas cada vez pior, e a Marina quer entender por quê antes da próxima reunião do Conselho.","evidencias":["Em março, um banco concorrente lançou um cartão sem anuidade com 3% de cashback e campanha pesada nas redes.","Entre os clientes que fugiram em produção, 60% eram de perfil que o modelo considerava de baixo risco: gasto alto e muitas categorias de compra.","Nenhuma coluna chega vazia ou com valores fora do padrão.","A taxa de fuga mensal subiu de 4% para 5,5%."],"_gabarito":{"evq1":{"a":0,"b":6,"c":1,"d":0},"evq2":{"a":1,"b":4,"c":0,"d":0}},"_explicacao":"O modelo aprendeu um mundo que mudou: o concorrente passou a atrair justamente os bons clientes. Modelo em produção precisa de monitoramento e retreino periódico."}},"_revelacao":{"armadilha":"Vazamento de dados","resumo":"Três colunas pareciam ótimas e só existiam depois que o cliente já tinha decidido sair. Quem as usou viu AUC perto de 0,99 no treino e um modelo inútil em produção.","secundaria":"A definição do alvo: só um em cada três clientes perdidos cancela formalmente. Prever cancelamento formal deixaria de fora dois terços do problema.","licoes":["Para cada coluna, pergunte: no dia em que o modelo rodar, essa informação já existe?","Desconfie de resultado bom demais. AUC perto de 1 costuma ser sintoma, não conquista.","Com classes raras, acurácia engana. Olhe precisão, recall e o custo de cada tipo de erro."]}}};

/*
 * Adaptador do Google Apps Script.
 * Liga o núcleo do jogo (ServerCore) à planilha e ao armazenamento do script.
 *
 * Abas da planilha (criadas por configurar()):
 *   Grupos     código | nome | caso
 *   Config     chave | valor   (chave_professor = senha do painel, duracao_f1, duracao_f2, duracao_f3, duracao_evento)
 *   Respostas  registro de cada fase enviada, para a correção
 */

function doPost(e) {
  var req = {};
  try { req = JSON.parse(e.postData.contents); } catch (x) { req = {}; }
  return saidaJson(servidor_().handle(req));
}

function doGet(e) {
  var acao = e && e.parameter && e.parameter.acao;
  if (acao === 'placar') return saidaJson(servidor_().handle({ acao: 'placar' }));
  return saidaJson({ ok: true, jogo: 'Desafios de IA', casos: Object.keys(CASOS) });
}

function saidaJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Armazenamento: lê todas as propriedades uma vez por requisição (economiza cota). */
function criarStore_() {
  var props = PropertiesService.getScriptProperties(), cacheLocal = null;
  function carregar() { if (!cacheLocal) cacheLocal = props.getProperties(); return cacheLocal; }
  return {
    get: function (k) { var v = carregar()['J_' + k]; return v ? JSON.parse(v) : null; },
    set: function (k, v) { var s = JSON.stringify(v); carregar()['J_' + k] = s; props.setProperty('J_' + k, s); },
    del: function (k) { carregar(); delete cacheLocal['J_' + k]; props.deleteProperty('J_' + k); },
    recarregar: function () { cacheLocal = null; }
  };
}

function lerConfig_() {
  var cache = CacheService.getScriptCache(), c = cache.get('config');
  if (c) return JSON.parse(c);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var grupos = [], cfg = { grupos: grupos, duracoes: {} };
  var abaG = ss.getSheetByName('Grupos'), abaC = ss.getSheetByName('Config');
  if (!abaG || !abaC) throw new Error('Planilha não configurada. Rode a função configurar() no editor do Apps Script.');
  abaG.getDataRange().getValues().slice(1).forEach(function (l) {
    if (String(l[0]).trim() && String(l[2]).trim()) grupos.push({ codigo: String(l[0]).trim(), nome: String(l[1]).trim() || String(l[0]).trim(), caso: String(l[2]).trim() });
  });
  abaC.getDataRange().getValues().forEach(function (l) {
    var k = String(l[0]).trim(), v = l[1];
    if (k === 'chave_professor') cfg.chaveProfessor = String(v).trim();
    if (k.indexOf('duracao_') === 0) cfg.duracoes[k.replace('duracao_', '')] = Number(v) || 6;
  });
  cache.put('config', JSON.stringify(cfg), 60);
  return cfg;
}

function registrar_(ev) {
  if (ev.tipo !== 'envio') return;
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Respostas');
  if (aba) aba.appendRow([new Date(), ev.grupo, ev.codigo, ev.caso, ev.fase, ev.pontos, ev.automatico ? 'sim' : 'não', JSON.stringify(ev.respostas)]);
}

function servidor_() {
  var store = criarStore_();
  return ServerCore.create({
    store: store, casos: CASOS, config: lerConfig_(), registrar: registrar_,
    comTrava: function (fn) {
      var trava = LockService.getScriptLock();
      trava.waitLock(20000);
      try { store.recarregar(); return fn(); } finally { trava.releaseLock(); }
    }
  });
}

/* ---------- Funções para rodar no editor ---------- */

/** Cria as abas, gera códigos de grupo e a chave do professor. Rode uma vez. */
function configurar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function aba(nome) { return ss.getSheetByName(nome) || ss.insertSheet(nome); }
  var g = aba('Grupos');
  if (g.getLastRow() < 2) {
    // Alterna os casos disponíveis entre os grupos (ex.: supervisionado, clustering, supervisionado...)
    var ids = Object.keys(CASOS).sort(function (a, b) { return (CASOS[a]._modelo.tipo === 'agrupamento') - (CASOS[b]._modelo.tipo === 'agrupamento'); });
    var porTipo = [ids.filter(function (id) { return CASOS[id]._modelo.tipo !== 'agrupamento'; }), ids.filter(function (id) { return CASOS[id]._modelo.tipo === 'agrupamento'; })];
    var linhas = [['Código', 'Nome do grupo', 'Caso']];
    for (var i = 0; i < 6; i++) {
      var lista = porTipo[i % 2].length ? porTipo[i % 2] : ids;
      linhas.push([codigoAleatorio_(), 'Grupo ' + (i + 1), lista[Math.floor(i / 2) % lista.length]]);
    }
    g.getRange(1, 1, linhas.length, 3).setValues(linhas);
    g.setFrozenRows(1);
    g.getRange('A1:C1').setFontWeight('bold');
  }
  var c = aba('Config');
  if (c.getLastRow() < 1) {
    c.getRange('B1').setNumberFormat('@'); // mantém o zero à esquerda da senha
    c.getRange(1, 1, 6, 2).setValues([
      ['chave_professor', '020271'],
      ['duracao_f1', 6], ['duracao_f2', 12], ['duracao_f3', 8], ['duracao_evento', 6],
      ['casos disponíveis', Object.keys(CASOS).join(', ')]
    ]);
  }
  var r = aba('Respostas');
  if (r.getLastRow() < 1) {
    r.appendRow(['Quando', 'Grupo', 'Código', 'Caso', 'Fase', 'Pontos', 'Encerrada pelo tempo', 'Respostas (JSON)']);
    r.setFrozenRows(1);
  }
  CacheService.getScriptCache().remove('config');
  SpreadsheetApp.getUi().alert('Pronto. Confira as abas Grupos e Config. A senha do professor está na aba Config e pode ser trocada lá.');
}

/** Apaga o jogo em andamento (pontos, respostas e placar). A planilha Respostas é mantida. */
function reiniciarJogo() {
  var props = PropertiesService.getScriptProperties(), todas = props.getProperties();
  Object.keys(todas).forEach(function (k) { if (k.indexOf('J_') === 0) props.deleteProperty(k); });
  CacheService.getScriptCache().remove('config');
}

function codigoAleatorio_() {
  var a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 6; i++) { s += a.charAt(Math.floor(Math.random() * a.length)); if (i === 2) s += '-'; }
  return s;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Desafios de IA')
    .addItem('Configurar planilha', 'configurar')
    .addItem('Reiniciar jogo', 'reiniciarJogo')
    .addToUi();
}

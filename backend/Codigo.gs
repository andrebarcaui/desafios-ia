/*
 * Desafios de IA: servidor do jogo (Google Apps Script).
 * ARQUIVO GERADO por tools/build.js. Não edite aqui: edite shared/, backend/adaptador.gs.js e casos-fonte/.
 * Gerado em 2026-11-24T12:51:44.855Z
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
  var TITULOS_FASE = ['Sala de espera', 'Enquadre o problema', 'Monte o dataset', 'Treine e avalie', 'Seis meses em produção', 'Pitch ao comitê', 'Revelação'];
  var JOGAVEIS = { f1: 1, f2: 2, f3: 3, evento: 4 };
  var DURACOES = { f1: 6, f2: 12, f3: 8, evento: 6 };

  function fmtAuc(x) { return (Math.round(x * 100) / 100).toFixed(2).replace('.', ','); }
  function fmtPct(x) { return (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',') + '%'; }
  function fmtReais(x) { var s = Math.round(Math.abs(x)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (x < 0 ? '-R$ ' : 'R$ ') + s; }
  function fmtInt(x) { return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function limpar(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200); }
  function achar(lista, id) { for (var i = 0; i < (lista || []).length; i++) if (lista[i].id === id) return lista[i]; return null; }
  function bonusDesempenho(auc) { return Math.max(0, Math.min(15, Math.round((auc - 0.5) * 30))); }

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
        aucValidacao: val, aucProducao: prod, divisao: div || null,
        acuracia: Stats.acuraciaPadrao(val, caso.simulador), acuraciaIngenua: 1 - caso.simulador.prevalencia,
        cenario: vaz.length ? 'vazamento' : 'drift', nFeatures: usadas.length,
        flags: { vazamento: vaz, sensivel: sens, ruido: ruido, redes: redes }
      };
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
        g.pontos.desempenho = bonusDesempenho(g.modelo.aucValidacao);
        if (g.modelo.aucValidacao >= 0.95) feed(glob, g.nome + ' treinou um modelo com AUC de ' + fmtAuc(g.modelo.aucValidacao) + '. Impressionante.', 'alta');
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
      var sim = itemPorTipo(caso, 'simulador'), env = g.enviadas[sim ? sim.fase.id : ''];
      if (!sim || !env || !g.modelo) return null;
      var r = env.respostas[sim.item.id];
      if (!r || !r.pct) return null;
      var p = caso.simulador, pct = Number(r.pct);
      return { item: sim.item, env: env, pct: pct, prometido: Stats.simular(g.modelo.aucValidacao, p, pct).valor, real: Stats.simular(g.modelo.aucProducao, p, pct).valor, otimoReal: Stats.otimo(g.modelo.aucProducao, p).valor };
    }
    function sim_fase(caso) { return itemPorTipo(caso, 'simulador').fase.id; }
    function reavaliarCampanha(caso, g) {
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
          }
        });
        if (f.id === 'evento' && g.modelo) linhas.unshift({ rotulo: 'AUC em produção', valor: fmtAuc(g.modelo.aucProducao) });
        secoes.push({ titulo: f.titulo, linhas: linhas });
      });
      return { grupo: g.nome, caso: caso.titulo, empresa: caso.empresa, secoes: secoes };
    }

    function eventoVisao(caso, g) {
      if (!g.modelo || !caso._evento) return null;
      var ev = caso._evento[g.modelo.cenario];
      function sub(s) {
        return s.replace('{aucValidacao}', fmtAuc(g.modelo.aucValidacao)).replace('{aucProducao}', fmtAuc(g.modelo.aucProducao))
          .replace('{colunasVazamento}', g.modelo.flags.vazamento.join(', '));
      }
      var c = campanha(caso, g);
      return { titulo: ev.titulo, mensagem: sub(ev.mensagem), evidencias: ev.evidencias.map(sub), aucValidacao: g.modelo.aucValidacao, aucProducao: g.modelo.aucProducao,
        campanha: c ? { pct: c.pct, prometido: c.prometido, real: c.real } : null };
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

    function visaoGrupo(g, glob) {
      var caso = casos[g.caso], fid = FASES[glob.fase], gs = ranking(), pos = 0;
      for (var i = 0; i < gs.length; i++) if (gs[i].codigo === g.codigo) pos = i + 1;
      var dicas = [];
      caso.fases.forEach(function (f) { (f.dicas || []).forEach(function (d) { if (g.dicas.indexOf(d.id) >= 0) dicas.push({ id: d.id, fase: f.id, titulo: d.titulo, texto: d._texto }); }); });
      var enviadas = {};
      for (var k in g.enviadas) enviadas[k] = { respostas: g.enviadas[k].respostas, pontos: g.enviadas[k].pontos, ts: g.enviadas[k].ts, automatico: g.enviadas[k].automatico, rapido: g.enviadas[k].rapido };
      var modelo = null;
      if (g.modelo) {
        modelo = { aucValidacao: g.modelo.aucValidacao, acuracia: g.modelo.acuracia, acuraciaIngenua: g.modelo.acuraciaIngenua, divisao: g.modelo.divisao, nFeatures: g.modelo.nFeatures };
        if (glob.fase >= 4) modelo.aucProducao = g.modelo.aucProducao;
      }
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
          auc: g.modelo ? (glob.fase >= 4 ? { treino: g.modelo.aucValidacao, producao: g.modelo.aucProducao } : (g.enviadas.f3 ? { treino: g.modelo.aucValidacao } : null)) : null
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
          enviadas: g.enviadas, rascunhos: g.rascunhos, modelo: g.modelo, telemetria: g.telemetria,
          online: online(g.codigo), visto: store.get('v:' + g.codigo)
        };
      });
      var semEntrar = cfg.grupos.filter(function (c) { return !lerGrupo(c.codigo); }).map(function (c) { return { codigo: normCodigo(c.codigo), nome: c.nome, caso: c.caso }; });
      return { agora: agora(), global: glob, faseTitulo: TITULOS_FASE[glob.fase], titulosFase: TITULOS_FASE, grupos: gs, semEntrar: semEntrar, duracoes: duracoes };
    }

    function exportar() {
      var linhas = [], cols = ['Grupo', 'Código', 'Caso', 'Membros', 'Total', 'F1', 'F2', 'F3', 'Evento', 'Desempenho', 'Velocidade', 'Bônus créditos', 'Créditos restantes', 'AUC treino', 'AUC produção', 'Vazamento usado', 'Sensível usado', 'Comprou redes sociais', 'Saídas da aba', 'Tempo fora (min)', 'Colagens', 'Caracteres colados', 'Inserções grandes'];
      var itensCols = [];
      var primeiro = casos[cfg.grupos[0].caso];
      primeiro.fases.forEach(function (f) { f.itens.forEach(function (it) { if (it.tipo === 'escolha' || it.tipo === 'texto' || it.tipo === 'simulador') { itensCols.push(it.id); cols.push(f.id + ' / ' + it.rotulo); } }); });
      ranking().forEach(function (g) {
        var caso = casos[g.caso], m = g.modelo, t = g.telemetria;
        var l = [g.nome, g.codigo, caso.titulo, g.membros.join('; '), total(g), g.pontos.f1, g.pontos.f2, g.pontos.f3, g.pontos.evento, g.pontos.desempenho, g.pontos.velocidade, Math.floor(Math.max(0, g.creditos) / 10), g.creditos,
          m ? fmtAuc(m.aucValidacao) : '', m ? fmtAuc(m.aucProducao) : '', m ? m.flags.vazamento.join(', ') : '', m ? m.flags.sensivel.join(', ') : '', m && m.flags.redes ? 'sim' : 'não',
          t.saidas, Math.round(t.tempoForaMs / 6000) / 10, t.colagens, t.charsColados, t.insercoesGrandes];
        itensCols.forEach(function (id) {
          var v = '';
          caso.fases.forEach(function (f) { var it = achar(f.itens, id); if (!it) return; var r = respostasDe(g, f.id)[id];
            if (it.tipo === 'escolha') v = textoOpcao(it, r) || ''; else if (it.tipo === 'texto') v = limpar(r, 500); else if (it.tipo === 'simulador') v = r && r.pct ? r.pct + '%' : ''; });
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
        var m = g.modelo;
        return { ok: true, modelo: { aucValidacao: m.aucValidacao, acuracia: m.acuracia, acuraciaIngenua: m.acuraciaIngenua, divisao: m.divisao, nFeatures: m.nFeatures } };
      },
      placar: function () { return visaoPlacar(lerGlobal()); },

      /* Professor */
      prof_estado: function () { return visaoProfessor(lerGlobal()); },
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
          if (!g.modelo) g.modelo = calcularModelo(casos[g.caso], g);
          g.pontos.desempenho = bonusDesempenho(g.modelo.aucProducao);
          var camp = reavaliarCampanha(casos[g.caso], g);
          var txt = g.nome + ': em produção, a AUC ' + (g.modelo.aucValidacao - g.modelo.aucProducao >= 0.15 ? 'despencou' : 'caiu') + ' de ' + fmtAuc(g.modelo.aucValidacao) + ' para ' + fmtAuc(g.modelo.aucProducao);
          if (camp && camp.real < 0) txt += ' e a campanha passou a dar prejuízo';
          feed(glob, txt, g.modelo.aucValidacao - g.modelo.aucProducao >= 0.15 ? 'queda' : 'drift');
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
        var leitura = req.acao === 'placar' || req.acao === 'estado' || req.acao === 'prof_estado' || req.acao === 'prof_exportar';
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


var CASOS = {"fuga-silenciosa":{"id":"fuga-silenciosa","exercicio":"ml-supervisionado","titulo":"A Fuga Silenciosa","subtitulo":"Prever quem vai deixar o cartão antes que seja tarde","setor":"Banco digital, cartão de crédito","empresa":"Banco Arandu","creditosIniciais":100,"briefing":{"remetente":"Marina Couto","cargo":"Diretora de Cartões, Banco Arandu","assunto":"Preciso de IA para segurar nossos clientes","mensagem":["Pessoal, preciso da ajuda de vocês com urgência.","Perdemos uns 230 mil clientes de cartão nos últimos 12 meses. Cada cliente ativo nos dá, em média, R$ 900 de margem por ano, então façam a conta. O Conselho quer um plano em 30 dias.","A ideia é simples: quero uma IA que me diga quem vai cancelar o cartão, para eu fazer uma oferta antes. O pessoal de dados diz que tem tudo na base, mais de 200 colunas por cliente. Já temos até o campo de cancelamento lá.","Vocês me ajudam a desenhar isso? Não preciso de código, preciso saber o que pedir ao time de dados e se dá para confiar no resultado."],"contexto":[{"titulo":"A empresa","texto":"O Banco Arandu é um banco 100% digital, com 2,4 milhões de cartões de crédito ativos e sem anuidade. A receita vem de juros e da tarifa que o banco recebe a cada compra."},{"titulo":"Relatório do BI","texto":"No último ano, o sistema registrou 81 mil cancelamentos formais de cartão, feitos pelo app ou pelo telefone."},{"titulo":"Base de dados","texto":"O time de dados guarda uma foto mensal de cada cliente (uma linha por cliente por mês) desde janeiro de 2025: 18 meses de histórico."},{"titulo":"Campanha de retenção","texto":"Um piloto do ano passado testou uma oferta de cashback de 2% por 3 meses. Cada cliente abordado custou, em média, R$ 40. A oferta convenceu a ficar cerca de 30% dos clientes que iam sair."},{"titulo":"Tamanho do problema","texto":"Em qualquer mês, cerca de 4% dos clientes ativos param de usar o cartão nos 60 dias seguintes."}]},"caixas":[{"id":"feature","nome":"Usar como feature","ajuda":"Informação que existe no momento da previsão e ajuda a prever"},{"id":"vazamento","nome":"Vazamento","ajuda":"Só existe depois que o resultado já aconteceu"},{"id":"sensivel","nome":"Sensível ou proxy","ajuda":"Dado protegido ou substituto de um dado protegido"},{"id":"descartar","nome":"Descartar","ajuda":"Não carrega padrão útil"}],"simulador":{"baseClientes":2400000,"prevalencia":0.04,"custoAcao":40,"valorCliente":900,"taxaSalvamento":0.3,"minPct":1,"maxPct":40,"rotuloAcao":"abordar com a oferta de retenção","rotuloPositivo":"clientes que iam fugir"},"fases":[{"id":"f1","titulo":"Enquadre o problema","curto":"Enquadre","duracaoMin":6,"missao":"Transformem o pedido da Marina num problema de machine learning bem formulado. Antes de pensar em dados, decidam o que exatamente o modelo vai prever, quando e para quê.","itens":[{"id":"f1q1","tipo":"escolha","rotulo":"Decisão apoiada","enunciado":"Qual decisão de negócio o modelo vai apoiar?","opcoes":[{"id":"a","texto":"Escolher, todo mês, quais clientes recebem a oferta de retenção antes de pararem de usar o cartão"},{"id":"b","texto":"Explicar ao Conselho por que os clientes estão indo embora"},{"id":"c","texto":"Separar os clientes em perfis de comportamento para campanhas de marketing"},{"id":"d","texto":"Estimar quanto de receita o banco vai perder no próximo trimestre"}],"_gabarito":{"a":6,"b":2,"c":0,"d":0},"pontosMax":6,"_explicacao":"A previsão só vale se mudar uma decisão. Aqui a decisão é a quem oferecer o cashback. Explicar causas (b) é diagnóstico, não previsão. Separar perfis sem rótulo (c) é aprendizado não supervisionado. Estimar receita agregada (d) é outro problema."},{"id":"f1q2","tipo":"escolha","rotulo":"Momento da previsão","enunciado":"Em que momento a previsão precisa ser feita?","opcoes":[{"id":"a","texto":"Quando o cliente pede o cancelamento"},{"id":"b","texto":"Uma vez por mês, prevendo quem vai parar de usar o cartão nos 60 dias seguintes"},{"id":"c","texto":"Uma vez por ano, no aniversário do cartão"},{"id":"d","texto":"Na abertura da conta"}],"_gabarito":{"a":0,"b":6,"c":2,"d":0},"pontosMax":6,"_explicacao":"A oferta precisa chegar antes da decisão do cliente, com tempo para agir. No pedido de cancelamento (a) já é tarde. Uma vez por ano (c) deixa a maioria das fugas passar. Na abertura da conta (d) ainda não existe histórico de uso."},{"id":"f1q3","tipo":"escolha","rotulo":"Tipo de problema","enunciado":"Que tipo de problema é esse?","opcoes":[{"id":"a","texto":"Classificação: prever uma classe (vai fugir ou não), com uma probabilidade associada"},{"id":"b","texto":"Regressão: prever um valor numérico, como o gasto do mês seguinte"},{"id":"c","texto":"Agrupamento: descobrir grupos de clientes parecidos, sem rótulos"},{"id":"d","texto":"Aprendizado por reforço: o sistema aprende testando ofertas e recebendo recompensa"}],"_gabarito":{"a":5,"b":1,"c":0,"d":0},"pontosMax":5,"_explicacao":"O que se quer saber é se o cliente vai ou não parar de usar o cartão: uma classe binária, com uma probabilidade que permite ordenar os clientes por risco."},{"id":"f1q4","tipo":"escolha","rotulo":"Variável-alvo","enunciado":"Qual deve ser a variável-alvo (o rótulo que o modelo aprende a prever)?","opcoes":[{"id":"a","texto":"Cancelou formalmente o cartão (sim ou não)"},{"id":"b","texto":"Ficou sem nenhuma compra nos 60 dias seguintes à data de referência, depois de ter usado o cartão nos 3 meses anteriores (sim ou não)"},{"id":"c","texto":"Deu nota de satisfação menor que 6 na pesquisa do app"},{"id":"d","texto":"Valor gasto no cartão no mês seguinte, em reais"}],"_gabarito":{"a":3,"b":8,"c":0,"d":2},"pontosMax":8,"_explicacao":"O BI registrou 81 mil cancelamentos formais, mas a Marina perdeu 230 mil clientes: só um em cada três avisa que está saindo. O resto simplesmente para de usar o cartão. Usar o campo de cancelamento (a) ensinaria o modelo a enxergar só a ponta do problema. A nota de satisfação (c) mede opinião de quem responde pesquisa, não comportamento. O gasto do mês seguinte (d) é outra pergunta."},{"id":"f1j","tipo":"texto","rotulo":"Por que esse alvo","enunciado":"Em até duas frases: por que esse alvo, e não o campo de cancelamento que a Marina mencionou?","maxChars":400}],"dicas":[{"id":"f1d1","titulo":"Ligar para o cientista de dados","custo":10,"_texto":"Antes de falar em algoritmo, respondam duas perguntas. Quando a previsão vai ser usada, e que informação existe naquele momento? E o que a Marina quer evitar: o pedido de cancelamento ou a perda do cliente?"},{"id":"f1d2","titulo":"Conversar com o time de Retenção","custo":10,"_texto":"A maioria dos clientes que perdemos nunca ligou para cancelar. O cartão continua aberto, só que ninguém usa. Para nós, cliente que não compra é cliente perdido."}]},{"id":"f2","titulo":"Monte o dataset","curto":"Dataset","duracaoMin":12,"missao":"O time de dados separou 16 colunas candidatas. Classifiquem cada uma numa das quatro caixas e decidam se vale comprar dados externos. O dataset que vocês montarem é o que o modelo vai usar.","itens":[{"id":"f2cartas","tipo":"cartas","rotulo":"Colunas","enunciado":"Arrastem cada coluna para uma caixa (ou cliquem na coluna e depois na caixa).","pontosPorCarta":2,"pontosMax":32,"cartas":[{"id":"c01","nome":"id_cliente","descricao":"Identificador único do cliente na base.","exemplos":["88231907","10455321","77310022"],"_gabarito":"descartar","_explicacao":"Um identificador não carrega padrão de comportamento. Usado como feature, deixa o modelo decorar clientes específicos."},{"id":"c02","nome":"meses_relacionamento","descricao":"Há quantos meses o cliente tem o cartão.","exemplos":["4","37","112"],"_gabarito":"feature","_explicacao":"Existe na data de referência e ajuda a prever: clientes novos fogem mais."},{"id":"c03","nome":"limite_credito","descricao":"Limite total do cartão na data de referência.","exemplos":["R$ 1.200","R$ 8.500","R$ 22.000"],"_gabarito":"feature","_explicacao":"Informação disponível e relevante: limite baixo costuma levar o cliente a usar outro cartão."},{"id":"c04","nome":"pct_limite_usado_3m","descricao":"Média do percentual do limite utilizado nos últimos 3 meses.","exemplos":["12%","64%","3%"],"_gabarito":"feature","_explicacao":"Mede o quanto o cartão é o principal do cliente. Disponível e útil."},{"id":"c05","nome":"variacao_gasto_3m_vs_6m","descricao":"Gasto dos últimos 3 meses comparado ao dos 3 meses anteriores.","exemplos":["-72%","+8%","-15%"],"_gabarito":"feature","_explicacao":"Um dos sinais mais fortes: quem está saindo costuma reduzir o uso aos poucos."},{"id":"c06","nome":"dias_sem_transacao","descricao":"Dias desde a última compra no cartão, contados na data de referência.","exemplos":["2","41","19"],"_gabarito":"feature","_explicacao":"Sinal forte e legítimo, porque é medido até a data de referência, antes do período que se quer prever."},{"id":"c07","nome":"categorias_compra_3m","descricao":"Quantas categorias diferentes (mercado, transporte, streaming...) tiveram compras nos últimos 3 meses.","exemplos":["1","7","4"],"_gabarito":"feature","_explicacao":"Quem usa o cartão para muitas coisas está mais preso a ele."},{"id":"c08","nome":"faturas_atraso_12m","descricao":"Faturas pagas com atraso nos últimos 12 meses.","exemplos":["0","3","1"],"_gabarito":"feature","_explicacao":"Histórico disponível e associado a mudança de comportamento."},{"id":"c09","nome":"contatos_sac_90d","descricao":"Contatos com o atendimento (chat, telefone, app) nos 90 dias anteriores à data de referência.","exemplos":["0","5","1"],"_gabarito":"feature","_explicacao":"Medido antes da data de referência, então é legítimo. Muitos contatos costumam indicar insatisfação."},{"id":"c10","nome":"cartao_em_carteira_digital","descricao":"Se o cartão está cadastrado na carteira digital do celular, para pagar por aproximação.","exemplos":["sim","não","sim"],"_gabarito":"feature","_explicacao":"Cartão na carteira digital é cartão do dia a dia. Disponível e útil."},{"id":"c11","nome":"protocolo_cancelamento","descricao":"Se o cliente abriu protocolo de cancelamento. Preenchido pelo atendimento no dia em que o cliente pede para cancelar.","exemplos":["não","sim","não"],"_gabarito":"vazamento","_explicacao":"Só é preenchido quando o cliente já decidiu sair. No momento da previsão, essa coluna está vazia para quem ainda não pediu, e é justamente esse cliente que interessa."},{"id":"c12","nome":"aceitou_oferta_retencao","descricao":"Se o cliente aceitou a contraproposta da equipe de retenção. A equipe só faz contraproposta a quem pede cancelamento.","exemplos":["não","não","sim"],"_gabarito":"vazamento","_explicacao":"Depende de um pedido de cancelamento que ainda não aconteceu no momento da previsão."},{"id":"c13","nome":"gasto_medio_mensal_ano","descricao":"Gasto médio mensal no ano civil (janeiro a dezembro), calculado pelo BI em janeiro do ano seguinte e gravado em todas as linhas daquele ano.","exemplos":["R$ 340","R$ 2.100","R$ 0"],"_gabarito":"vazamento","_explicacao":"O vazamento mais traiçoeiro: a média inclui os meses que vêm depois da data de referência, ou seja, contém o próprio resultado que se quer prever."},{"id":"c14","nome":"cep_residencial","descricao":"CEP do endereço de cobrança.","exemplos":["22071-000","21650-210","04538-133"],"_gabarito":"sensivel","_explicacao":"Funciona como substituto de renda e de raça. Ofertas que mudam conforme o bairro podem virar tratamento discriminatório."},{"id":"c15","nome":"raca_cor_autodeclarada","descricao":"Raça ou cor informada voluntariamente na pesquisa interna de diversidade de clientes, em 2024.","exemplos":["Parda","Branca","Não informado"],"_gabarito":"sensivel","_explicacao":"Dado sensível pela LGPD, coletado para outra finalidade. Usá-lo para decidir quem recebe oferta é risco jurídico e ético."},{"id":"c16","nome":"codigo_agencia","descricao":"Código da agência a que o cliente está vinculado. O Arandu é 100% digital: todos os clientes estão na agência 0001.","exemplos":["0001","0001","0001"],"_gabarito":"descartar","_explicacao":"Tem o mesmo valor para todos os clientes, então não distingue ninguém."}]},{"id":"f2mercado","tipo":"mercado","rotulo":"Dados externos comprados","enunciado":"Mercado de dados: fontes externas que podem ser compradas com créditos. A compra é imediata e não tem devolução.","pontosMax":8,"fontes":[{"id":"m1","nome":"Bureau de crédito","descricao":"Score atualizado e número de consultas de outros bancos ao CPF do cliente nos últimos 30 dias.","custo":30,"_gabarito":{"pontos":4,"auc":0.03},"_explicacao":"Consultas recentes de outros bancos costumam indicar que o cliente está pedindo cartão em outro lugar."},{"id":"m2","nome":"Navegação no app","descricao":"Telas que o cliente visitou no app nos 30 dias anteriores à data de referência.","custo":20,"_gabarito":{"pontos":4,"auc":0.03},"_explicacao":"Visitas à tela de limite, de tarifas ou de cancelamento são sinais precoces, medidos antes da data de referência."},{"id":"m3","nome":"Clima e feriados","descricao":"Temperatura, chuva e calendário de feriados por cidade, dia a dia.","custo":15,"_gabarito":{"pontos":0,"auc":0},"_explicacao":"Útil para prever demanda de loja, irrelevante para a decisão de abandonar um cartão."},{"id":"m4","nome":"Perfis em redes sociais","descricao":"Interesses e conexões dos clientes, de uma empresa que coleta dados de redes sociais.","custo":25,"_gabarito":{"pontos":-4,"auc":0.005,"flag":"redes"},"_explicacao":"Origem duvidosa, sem consentimento dos clientes para essa finalidade. O ganho é mínimo e o risco de LGPD é alto."}]}],"dicas":[{"id":"f2d1","titulo":"Perguntar ao engenheiro de dados","custo":10,"_texto":"Algumas colunas são preenchidas depois que o cliente já decidiu sair. Para cada coluna, perguntem: no dia em que o modelo rodar, essa informação já existe? Atenção especial a campos calculados pelo BI."},{"id":"f2d2","titulo":"Consultar o Jurídico","custo":10,"_texto":"A LGPD trata origem racial como dado sensível, com regras rígidas de uso. E variáveis aparentemente neutras podem funcionar como substitutas de características protegidas."}]},{"id":"f3","titulo":"Treine e avalie","curto":"Treino","duracaoMin":8,"missao":"Hora de treinar. Decidam como separar os dados, como medir o modelo e quantos clientes a campanha deve abordar por mês.","itens":[{"id":"f3q1","tipo":"escolha","rotulo":"Divisão dos dados","enunciado":"A base tem uma linha por cliente por mês, durante 18 meses. Como separar treino, validação e teste?","opcoes":[{"id":"a","texto":"Sorteio aleatório das linhas: 70% treino, 15% validação, 15% teste"},{"id":"b","texto":"Por tempo: treinar com os meses mais antigos e validar e testar com os mais recentes"},{"id":"c","texto":"Treinar e testar com todos os dados, para aproveitar ao máximo"},{"id":"d","texto":"Usar só os últimos 3 meses, porque são os mais parecidos com o futuro"}],"_gabarito":{"a":3,"b":8,"c":0,"d":2},"pontosMax":8,"_explicacao":"O modelo vai prever o futuro a partir do passado, e o teste precisa imitar isso. No sorteio aleatório (a), o mesmo cliente aparece no treino e no teste em meses vizinhos, e o resultado fica otimista. Testar com os dados de treino (c) não mede nada. Três meses (d) deixam poucos exemplos de fuga."},{"id":"f3q2","tipo":"escolha","rotulo":"Como avaliar","enunciado":"Só 4% dos clientes fogem. Como avaliar se o modelo é bom?","opcoes":[{"id":"a","texto":"Pela acurácia: o percentual total de acertos"},{"id":"b","texto":"Pela precisão e pelo recall da classe \"fuga\", olhando a matriz de confusão e a curva ROC (AUC)"},{"id":"c","texto":"Pelo erro médio, em reais"},{"id":"d","texto":"Pelo tempo que o modelo leva para rodar"}],"_gabarito":{"a":0,"b":7,"c":0,"d":0},"pontosMax":7,"_explicacao":"Com 4% de positivos, um modelo que responde \"ninguém vai fugir\" acerta 96% e não serve para nada. O que importa é quantos fujões o modelo encontra (recall) e quantos dos apontados fogem mesmo (precisão)."},{"id":"f3sim","tipo":"simulador","rotulo":"Campanha","enunciado":"Treinem o modelo e decidam qual percentual dos clientes, do maior para o menor risco, a campanha vai abordar por mês.","pontosMax":10,"divisaoItem":"f3q1"},{"id":"f3j","tipo":"texto","rotulo":"Confiança no resultado","enunciado":"Em até duas frases: vocês confiam no resultado do treino? Por quê?","maxChars":400}],"dicas":[{"id":"f3d1","titulo":"Ligar para o cientista de dados","custo":10,"_texto":"Cada cliente aparece uma vez por mês na base. Se o mesmo cliente cai no treino e no teste, o modelo cola de si mesmo. E desconfiem de resultado bom demais: em fuga de clientes, AUC acima de 0,90 quase sempre é sintoma de problema nos dados."},{"id":"f3d2","titulo":"Falar com o Financeiro","custo":10,"_texto":"Cada cliente abordado custa R$ 40, fuja ele ou não. Só vale continuar abordando enquanto a chance de acertar um fujão compensar esse custo."}]},{"id":"evento","titulo":"Seis meses em produção","curto":"Produção","duracaoMin":6,"missao":"O modelo de vocês foi para produção. Seis meses depois, a Marina chama a equipe para uma conversa difícil.","itens":[{"id":"evq1","tipo":"escolha","rotulo":"Diagnóstico","enunciado":"Qual é o diagnóstico mais provável?","opcoes":[{"id":"a","texto":"Vazamento de dados: o treino usou informação que não existe no momento da previsão"},{"id":"b","texto":"Drift: o comportamento dos clientes mudou depois do treino"},{"id":"c","texto":"Overfitting: o modelo tem camadas demais e decorou o treino"},{"id":"d","texto":"Erro de rotulagem: o time de dados marcou os rótulos errados"}],"pontosMax":6},{"id":"evq2","tipo":"escolha","rotulo":"Ação","enunciado":"O que fazer agora?","opcoes":[{"id":"a","texto":"Retreinar só com colunas que existem no momento da previsão"},{"id":"b","texto":"Retreinar com os dados mais recentes e monitorar o desempenho todo mês"},{"id":"c","texto":"Trocar por um modelo mais complexo, com mais camadas"},{"id":"d","texto":"Desligar o modelo e voltar a escolher os clientes pela experiência do time"}],"pontosMax":4},{"id":"evj","tipo":"texto","rotulo":"O que faltou antes","enunciado":"Em até duas frases: o que a equipe deveria ter feito antes de ir para produção?","maxChars":400}],"dicas":[]}],"_modelo":{"aucBase":0.78,"pesoFeature":{"c05":0.04,"c06":0.04,"padrao":0.01},"ganhoSensivel":0.005,"ruido":{"validacao":0.01,"producao":-0.02},"vazamento":{"aucValidacao":0.985,"quedaProducao":0.16},"divisao":{"item":"f3q1","inflacao":{"a":0.04,"b":0,"c":0.09,"d":-0.03}},"drift":0.05,"aucMin":0.53,"aucMax":0.995},"_evento":{"vazamento":{"titulo":"O modelo virou uma moeda","mensagem":"No treino, o modelo de vocês chegou a AUC de {aucValidacao}. Seis meses depois, em produção, está em {aucProducao}. A campanha abordou milhares de clientes e quase nenhum dos que fugiram estava na lista. O Conselho quer saber o que aconteceu.","evidencias":["A taxa de fuga real continua em torno de 4% ao mês, como antes.","No monitoramento, {colunasVazamento} chega(m) com o mesmo valor para 100% dos clientes avaliados a cada mês.","No treino, essa(s) mesma(s) coluna(s) apareciam no topo da lista de importância do modelo.","O perfil dos clientes avaliados em produção é parecido com o do treino."],"_gabarito":{"evq1":{"a":6,"b":1,"c":0,"d":0},"evq2":{"a":4,"b":1,"c":0,"d":0}},"_explicacao":"As colunas de vazamento só são preenchidas depois que o cliente decidiu sair. No treino, o modelo aprendeu a ler a resposta. Em produção, a resposta ainda não existe."},"drift":{"titulo":"O mercado mudou","mensagem":"No treino, o modelo de vocês chegou a AUC de {aucValidacao}. Seis meses depois, em produção, está em {aucProducao}. Ainda funciona, mas cada vez pior, e a Marina quer entender por quê antes da próxima reunião do Conselho.","evidencias":["Em março, um banco concorrente lançou um cartão sem anuidade com 3% de cashback e campanha pesada nas redes.","Entre os clientes que fugiram em produção, 60% eram de perfil que o modelo considerava de baixo risco: gasto alto e muitas categorias de compra.","Nenhuma coluna chega vazia ou com valores fora do padrão.","A taxa de fuga mensal subiu de 4% para 5,5%."],"_gabarito":{"evq1":{"a":0,"b":6,"c":1,"d":0},"evq2":{"a":1,"b":4,"c":0,"d":0}},"_explicacao":"O modelo aprendeu um mundo que mudou: o concorrente passou a atrair justamente os bons clientes. Modelo em produção precisa de monitoramento e retreino periódico."}},"_revelacao":{"armadilha":"Vazamento de dados","resumo":"Três colunas pareciam ótimas e só existiam depois que o cliente já tinha decidido sair. Quem as usou viu AUC perto de 0,99 no treino e um modelo inútil em produção.","secundaria":"A definição do alvo: só um em cada três clientes perdidos cancela formalmente. Prever cancelamento formal deixaria de fora dois terços do problema.","licoes":["Para cada coluna, pergunte: no dia em que o modelo rodar, essa informação já existe?","Desconfie de resultado bom demais. AUC perto de 1 costuma ser sintoma, não conquista.","Com classes raras, acurácia engana. Olhe precisão, recall e o custo de cada tipo de erro."]}}};

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
    var casoPadrao = Object.keys(CASOS)[0], linhas = [['Código', 'Nome do grupo', 'Caso']];
    for (var i = 1; i <= 6; i++) linhas.push([codigoAleatorio_(), 'Grupo ' + i, casoPadrao]);
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

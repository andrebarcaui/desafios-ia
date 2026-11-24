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

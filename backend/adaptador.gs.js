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

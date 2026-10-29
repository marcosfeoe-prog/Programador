import { ESCALA, TORNADOS, FORMATOS, APARENCIAS, classificar, escalaDe } from './dados.js';
import { desenharTornado } from './ilustracao.js';

const CHAVE = 'tornadopedia.artigos';
const $conteudo = document.getElementById('conteudo');

// ---------- utilidades ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const semAcento = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const num = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));

function lerLocais() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) || [];
  } catch {
    return [];
  }
}

function salvarLocais(lista) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
    return true;
  } catch {
    alert('Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado. Tente uma imagem menor.');
    return false;
  }
}

function todos() {
  return [...TORNADOS, ...lerLocais().map((t) => ({ ...t, local_: true }))];
}

const porId = (id) => todos().find((t) => t.id === id);

function selo(classe, grande = false) {
  const e = escalaDe(classe);
  return `<a class="selo${grande ? ' grande' : ''}" href="#/classe/${e.classe}" style="--c:${e.cor}" title="${esc(e.nome)} — ${esc(e.faixa)}">${e.classe}</a>`;
}

function figura(t, classe = '') {
  if (t.imagem) {
    return `<figure class="figura ${classe}">
      <img src="${esc(t.imagem)}" alt="${esc(t.nome)}" loading="lazy" />
      <span class="tag-ia" title="Imagem gerada por inteligência artificial">${t.local_ ? 'Imagem enviada' : 'IA'}</span>
    </figure>`;
  }
  return `<figure class="figura ${classe}">
    <canvas class="ilustra" width="640" height="360" data-formato="${esc(t.formato)}" data-aparencia="${esc(t.aparencia)}" data-semente="${esc(t.id)}"></canvas>
    <span class="tag-ia pendente" title="Ilustração provisória: a imagem por IA ainda não foi adicionada">Ilustração</span>
  </figure>`;
}

function pintarIlustracoes() {
  for (const c of $conteudo.querySelectorAll('canvas.ilustra')) {
    desenharTornado(c, { formato: c.dataset.formato, aparencia: c.dataset.aparencia, semente: c.dataset.semente });
  }
}

function cartao(t) {
  return `<a class="cartao" href="#/t/${esc(t.id)}">
    ${figura(t, 'mini')}
    <div class="cartao-txt">
      ${selo(t.classe).replace('<a ', '<span ').replace('</a>', '</span>')}
      <b>${esc(t.nome)}</b>
      <small>${esc(t.data)} · ${t.vento ? num(t.vento) + ' km/h' : 'ventos não estimados'}</small>
    </div>
  </a>`;
}

function tabelaEscala() {
  return `<table class="tabela escala">
    <thead><tr><th>Classe</th><th>Nome</th><th>Ventos</th><th>Danos típicos</th></tr></thead>
    <tbody>
      ${ESCALA.map(
        (e) => `<tr>
          <td>${selo(e.classe)}</td>
          <td>${esc(e.nome)}</td>
          <td class="nw">${esc(e.faixa)}</td>
          <td>${esc(e.danos)}</td>
        </tr>`
      ).join('')}
    </tbody>
  </table>`;
}

// ---------- páginas ----------

function paginaInicial() {
  const lista = todos();
  const destaque = TORNADOS[0];
  const recentes = lista.filter((t) => t.local_).slice(-4).reverse();
  const contagem = Object.fromEntries(ESCALA.map((e) => [e.classe, 0]));
  lista.forEach((t) => contagem[t.classe]++);

  return `
  <div class="boas-vindas">
    <h1>Bem-vindo à Tornadopédia</h1>
    <p>A enciclopédia livre de <b>tornados fictícios</b>. Atualmente com
      <b>${lista.length}</b> artigos, ilustrados com imagens geradas por IA.</p>
  </div>

  <div class="grade-inicial">
    <section class="caixa">
      <h2>Artigo em destaque</h2>
      <div class="destaque">
        ${figura(destaque)}
        <div>
          <h3><a href="#/t/${destaque.id}">${esc(destaque.nome)}</a> ${selo(destaque.classe)}</h3>
          <p>${esc(destaque.resumo)}</p>
          <p><a href="#/t/${destaque.id}">Ler artigo completo →</a></p>
        </div>
      </div>
    </section>

    <section class="caixa">
      <h2>Tornados por classe</h2>
      <ul class="barras">
        ${ESCALA.map(
          (e) => `<li>
            <a href="#/classe/${e.classe}">${selo(e.classe).replace('<a ', '<span ').replace('</a>', '</span>')}</a>
            <span class="barra"><i style="--c:${e.cor};width:${(contagem[e.classe] / Math.max(1, ...Object.values(contagem))) * 100}%"></i></span>
            <b>${contagem[e.classe]}</b>
          </li>`
        ).join('')}
      </ul>
    </section>
  </div>

  <section class="caixa">
    <h2>Escala de classificação</h2>
    ${tabelaEscala()}
  </section>

  ${
    recentes.length
      ? `<section class="caixa"><h2>Criados por você</h2><div class="cartoes">${recentes.map(cartao).join('')}</div></section>`
      : ''
  }

  <section class="caixa">
    <h2>Todos os tornados</h2>
    <div class="cartoes">${lista.map(cartao).join('')}</div>
  </section>`;
}

function paginaArtigo(id) {
  const t = porId(id);
  if (!t) return paginaNaoEncontrada(id);
  const e = escalaDe(t.classe);
  const linha = (rot, val) => (val == null || val === '' ? '' : `<tr><th>${rot}</th><td>${val}</td></tr>`);
  const secoes = t.secoes || [];

  return `
  <article class="artigo">
    <div class="artigo-topo">
      <h1>${esc(t.nome)}</h1>
      ${
        t.local_
          ? `<div class="acoes"><a class="btn" href="#/editar/${esc(t.id)}">Editar</a>
             <button class="btn perigo" data-apagar="${esc(t.id)}">Apagar</button></div>`
          : ''
      }
    </div>
    <p class="subtitulo">Da Tornadopédia, a wiki de tornados fictícios${t.local_ ? ' · artigo criado neste navegador' : ''}</p>

    <aside class="infobox" style="--c:${e.cor}">
      <div class="infobox-titulo">${esc(t.nome)}</div>
      ${figura(t)}
      <div class="infobox-classe">${selo(t.classe, true)}<span>${esc(e.nome)}<small>${esc(e.faixa)}</small></span></div>
      <table>
        ${linha('Data', esc(t.data))}
        ${linha('Horário', esc(t.hora))}
        ${linha('Local', esc(t.local))}
        ${linha('Ventos máx.', t.vento ? `${num(t.vento)} km/h` : 'Não estimados')}
        ${linha('Formato', esc(FORMATOS[t.formato] || t.formato))}
        ${linha('Aparência', esc(APARENCIAS[t.aparencia] || t.aparencia))}
        ${linha('Duração', esc(t.duracao))}
        ${linha('Trajetória', esc(t.trajetoria))}
        ${linha('Largura máx.', esc(t.largura))}
        ${linha('Mortes', num(t.mortes))}
        ${linha('Feridos', num(t.feridos))}
        ${linha('Prejuízo', esc(t.prejuizo))}
      </table>
    </aside>

    <p class="resumo">${esc(t.resumo)}</p>

    ${
      secoes.length > 1
        ? `<nav class="indice"><b>Conteúdo</b><ol>${secoes
            .map((s, i) => `<li><a href="#/t/${esc(t.id)}" data-ir="s${i}">${esc(s.titulo)}</a></li>`)
            .join('')}<li><a href="#/t/${esc(t.id)}" data-ir="classificacao">Classificação</a></li></ol></nav>`
        : ''
    }

    ${secoes
      .map(
        (s, i) => `<h2 id="s${i}">${esc(s.titulo)}</h2>
        ${String(s.texto || '')
          .split(/\n{2,}/)
          .map((p) => `<p>${esc(p)}</p>`)
          .join('')}`
      )
      .join('')}

    <h2 id="classificacao">Classificação</h2>
    <p>Com ${t.vento ? `ventos estimados em <b>${num(t.vento)} km/h</b>` : '<b>ventos não estimados</b>'},
      o tornado foi classificado como ${selo(t.classe)} <b>${esc(e.nome)}</b> (${esc(e.faixa)}).
      ${esc(e.danos)}</p>

    ${
      t.prompt
        ? `<details class="prompt"><summary>Prompt usado para a imagem de IA</summary>
            <code>${esc(t.prompt)}</code>
            ${t.imagem ? '' : '<p>Esta imagem ainda não foi gerada — por enquanto o artigo usa uma ilustração provisória.</p>'}
          </details>`
        : ''
    }

    <div class="categorias">Categorias:
      <a href="#/classe/${e.classe}">Tornados ${e.classe}</a> ·
      <a href="#/formato/${esc(t.formato)}">${esc(FORMATOS[t.formato] || t.formato)}</a> ·
      <a href="#/lista">Todos os tornados</a>
    </div>
  </article>`;
}

function paginaLista(filtro = {}) {
  let lista = todos();
  let titulo = 'Todos os tornados';
  let intro = '';
  if (filtro.classe) {
    const e = escalaDe(filtro.classe);
    lista = lista.filter((t) => t.classe === e.classe);
    titulo = `Categoria: Tornados ${e.classe}`;
    intro = `<p>${selo(e.classe, true)} <b>${esc(e.nome)}</b> — ${esc(e.faixa)}. ${esc(e.danos)}</p>`;
  }
  if (filtro.formato) {
    lista = lista.filter((t) => t.formato === filtro.formato);
    titulo = `Categoria: ${esc(FORMATOS[filtro.formato] || filtro.formato)}`;
  }
  const ordem = ['FU', 'F0', 'F1', 'F2', 'F3', 'F4', 'F5'];
  lista.sort((a, b) => ordem.indexOf(b.classe) - ordem.indexOf(a.classe) || (b.vento || 0) - (a.vento || 0));

  return `
  <h1>${titulo}</h1>
  ${intro}
  <p>${lista.length} artigo(s).</p>
  ${
    lista.length
      ? `<div class="rolagem"><table class="tabela">
          <thead><tr><th>Classe</th><th>Tornado</th><th>Data</th><th>Ventos</th><th>Formato</th><th>Mortes</th></tr></thead>
          <tbody>${lista
            .map(
              (t) => `<tr>
                <td>${selo(t.classe)}</td>
                <td><a href="#/t/${esc(t.id)}">${esc(t.nome)}</a></td>
                <td class="nw">${esc(t.data)}</td>
                <td class="nw">${t.vento ? num(t.vento) + ' km/h' : '—'}</td>
                <td>${esc(FORMATOS[t.formato] || t.formato)}</td>
                <td>${num(t.mortes)}</td>
              </tr>`
            )
            .join('')}</tbody></table></div>
          <div class="cartoes">${lista.map(cartao).join('')}</div>`
      : `<p>Nenhum tornado nesta categoria ainda. <a href="#/novo">Crie o primeiro!</a></p>`
  }`;
}

function paginaEscala() {
  return `
  <h1>Escala de classificação de tornados</h1>
  <p>Na Tornadopédia, cada tornado recebe uma classe de acordo com a velocidade máxima estimada dos ventos,
    deduzida a partir dos danos que causou. Tornados que não atingiram nada ou não puderam ser avaliados
    ficam como <b>FU</b> (Sem classe).</p>
  ${tabelaEscala()}
  <h2>Calculadora</h2>
  <p>Digite uma velocidade de vento para descobrir a classe:</p>
  <div class="calc">
    <input type="number" id="calc-v" min="0" max="700" placeholder="km/h" inputmode="numeric" />
    <output id="calc-r">—</output>
  </div>`;
}

function paginaImagens() {
  const lista = todos();
  return `
  <h1>Galeria de imagens</h1>
  <p>As imagens marcadas como <span class="tag-ia inline">IA</span> foram geradas por inteligência artificial a partir
    do prompt mostrado em cada artigo. Artigos marcados como <span class="tag-ia inline pendente">Ilustração</span>
    ainda usam um desenho provisório gerado pelo navegador.</p>
  <div class="galeria">
    ${lista
      .map(
        (t) => `<a href="#/t/${esc(t.id)}">${figura(t)}<span>${esc(t.nome)} ${selo(t.classe)
          .replace('<a ', '<span ')
          .replace('</a>', '</span>')}</span></a>`
      )
      .join('')}
  </div>`;
}

function paginaSobre() {
  return `
  <h1>Sobre a Tornadopédia</h1>
  <p>A Tornadopédia é uma wiki de <b>tornados inventados</b>. Nenhum dos tornados, cidades, datas ou vítimas existiu de verdade.</p>
  <h2>Imagens geradas por IA</h2>
  <p>As fotos dos artigos foram criadas por um gerador de imagens de IA. Cada artigo guarda o prompt usado,
    para que a imagem possa ser recriada ou melhorada. Para trocar uma imagem, coloque o arquivo em
    <code>wiki/imagens/ia/</code> e aponte o campo <code>imagem</code> do artigo em <code>wiki/js/dados.js</code> para ele.</p>
  <h2>Criar artigos</h2>
  <p>Em <a href="#/novo">Criar artigo</a> você pode escrever seu próprio tornado e enviar uma imagem (por exemplo,
    uma gerada por IA). Os artigos criados ficam salvos <b>neste navegador</b>.</p>
  <h2>Escala</h2>
  ${tabelaEscala()}`;
}

function paginaBusca(q) {
  const termo = semAcento(q).trim();
  const res = termo
    ? todos().filter((t) =>
        semAcento([t.nome, t.local, t.data, t.resumo, t.classe, FORMATOS[t.formato], ...(t.secoes || []).map((s) => s.texto)].join(' ')).includes(termo)
      )
    : [];
  return `
  <h1>Resultados da pesquisa</h1>
  <p>${res.length} resultado(s) para “${esc(q)}”.</p>
  ${res.length ? `<div class="cartoes">${res.map(cartao).join('')}</div>` : `<p>Nada encontrado. Que tal <a href="#/novo">criar esse artigo</a>?</p>`}`;
}

function paginaNaoEncontrada(id) {
  return `<h1>Artigo não encontrado</h1>
    <p>A Tornadopédia não tem um artigo chamado “${esc(id)}”. <a href="#/novo">Criar artigo</a> ou <a href="#/">voltar ao início</a>.</p>`;
}

function paginaFormulario(id) {
  const t = id ? lerLocais().find((a) => a.id === id) : null;
  if (id && !t) return paginaNaoEncontrada(id);
  const v = (k) => esc(t?.[k] ?? '');
  const texto = (t?.secoes || []).map((s) => `## ${s.titulo}\n${s.texto}`).join('\n\n');
  const opcoes = (obj, sel) => Object.entries(obj).map(([k, n]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');

  return `
  <h1>${t ? 'Editar artigo' : 'Criar artigo'}</h1>
  <p>O artigo fica salvo neste navegador. A classe é calculada automaticamente pelos ventos —
    deixe os ventos em branco para um tornado <b>FU</b> (Sem classe).</p>
  <form class="formulario" id="form-artigo">
    <label class="largo">Nome do tornado <input name="nome" required maxlength="90" value="${v('nome')}" placeholder="Tornado de ..." /></label>
    <label>Ventos máximos (km/h) <input name="vento" type="number" min="0" max="700" value="${v('vento')}" /></label>
    <label>Classe <output id="form-classe">${selo(t?.classe || 'FU')}</output></label>
    <label>Data <input name="data" value="${v('data')}" placeholder="1 de janeiro de 2024" /></label>
    <label>Horário <input name="hora" value="${v('hora')}" placeholder="17:00–17:20" /></label>
    <label class="largo">Local <input name="local" value="${v('local')}" placeholder="Cidade, Região" /></label>
    <label>Formato <select name="formato">${opcoes(FORMATOS, t?.formato || 'cone')}</select></label>
    <label>Aparência <select name="aparencia">${opcoes(APARENCIAS, t?.aparencia || 'cinza')}</select></label>
    <label>Duração <input name="duracao" value="${v('duracao')}" placeholder="12 minutos" /></label>
    <label>Trajetória <input name="trajetoria" value="${v('trajetoria')}" placeholder="8 km" /></label>
    <label>Largura máx. <input name="largura" value="${v('largura')}" placeholder="200 m" /></label>
    <label>Mortes <input name="mortes" type="number" min="0" value="${v('mortes')}" /></label>
    <label>Feridos <input name="feridos" type="number" min="0" value="${v('feridos')}" /></label>
    <label>Prejuízo <input name="prejuizo" value="${v('prejuizo')}" placeholder="R$ 1 milhão" /></label>
    <label class="largo">Resumo <textarea name="resumo" rows="3" required>${v('resumo')}</textarea></label>
    <label class="largo">Texto do artigo
      <textarea name="texto" rows="10" placeholder="## Formação&#10;Texto da seção...&#10;&#10;## Danos&#10;Texto da seção...">${esc(texto)}</textarea>
      <small>Comece cada seção com “## Título”.</small>
    </label>
    <label class="largo">Imagem (gerada por IA ou outra) <input name="imagem" type="file" accept="image/*" />
      <small>A imagem é reduzida para caber no armazenamento do navegador. Sem imagem, o artigo usa uma ilustração automática.</small>
    </label>
    <label class="largo">Prompt da imagem (opcional) <input name="prompt" value="${v('prompt')}" /></label>
    <div class="previa largo" id="previa">${t ? figura(t) : ''}</div>
    <div class="largo botoes">
      <button class="btn primario" type="submit">${t ? 'Salvar alterações' : 'Publicar artigo'}</button>
      <a class="btn" href="${t ? '#/t/' + esc(t.id) : '#/'}">Cancelar</a>
    </div>
  </form>`;
}

function reduzirImagem(arquivo, max = 1280) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = erro;
    img.src = URL.createObjectURL(arquivo);
  });
}

function slug(s) {
  return (
    semAcento(s)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'tornado'
  );
}

function ligarFormulario(idEditando) {
  const form = document.getElementById('form-artigo');
  const saida = document.getElementById('form-classe');
  form.vento.addEventListener('input', () => {
    saida.innerHTML = selo(classificar(form.vento.value === '' ? null : Number(form.vento.value)));
  });
  let imagemNova = null;
  form.imagem.addEventListener('change', async () => {
    const f = form.imagem.files[0];
    if (!f) return;
    imagemNova = await reduzirImagem(f);
    document.getElementById('previa').innerHTML = `<figure class="figura"><img src="${imagemNova}" alt="Prévia" /></figure>`;
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const locais = lerLocais();
    const antigo = idEditando ? locais.find((a) => a.id === idEditando) : null;
    const vento = d.vento === '' ? null : Number(d.vento);
    const secoes = [];
    for (const bloco of d.texto.split(/^##\s*/m)) {
      if (!bloco.trim()) continue;
      const [titulo, ...resto] = bloco.split('\n');
      if (resto.join('').trim()) secoes.push({ titulo: titulo.trim(), texto: resto.join('\n').trim() });
      else secoes.push({ titulo: 'Descrição', texto: titulo.trim() });
    }
    let id = antigo?.id;
    if (!id) {
      const base = slug(d.nome.replace(/^tornado( noturno)? d[eoa]s? /i, ''));
      const usados = new Set(todos().map((t) => t.id));
      id = base;
      for (let i = 2; usados.has(id); i++) id = `${base}-${i}`;
    }
    const artigo = {
      id,
      nome: d.nome.trim(),
      classe: classificar(vento),
      vento,
      data: d.data.trim(),
      hora: d.hora.trim(),
      local: d.local.trim(),
      duracao: d.duracao.trim(),
      trajetoria: d.trajetoria.trim(),
      largura: d.largura.trim(),
      formato: d.formato,
      aparencia: d.aparencia,
      mortes: d.mortes === '' ? null : Number(d.mortes),
      feridos: d.feridos === '' ? null : Number(d.feridos),
      prejuizo: d.prejuizo.trim(),
      resumo: d.resumo.trim(),
      prompt: d.prompt.trim(),
      secoes,
      imagem: imagemNova || antigo?.imagem || null,
    };
    const nova = antigo ? locais.map((a) => (a.id === id ? artigo : a)) : [...locais, artigo];
    if (salvarLocais(nova)) location.hash = `#/t/${id}`;
  });
}

// ---------- roteador ----------

function rota() {
  const [caminho, query] = location.hash.replace(/^#/, '').split('?');
  const partes = caminho.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query || '');
  let html;
  let titulo = 'Tornadopédia';

  switch (partes[0]) {
    case undefined:
      html = paginaInicial();
      break;
    case 't': {
      const t = porId(partes[1]);
      html = paginaArtigo(partes[1]);
      if (t) titulo = `${t.nome} — Tornadopédia`;
      break;
    }
    case 'lista':
      html = paginaLista();
      titulo = 'Todos os tornados — Tornadopédia';
      break;
    case 'classe':
      html = paginaLista({ classe: partes[1] });
      titulo = `Tornados ${partes[1]} — Tornadopédia`;
      break;
    case 'formato':
      html = paginaLista({ formato: partes[1] });
      break;
    case 'escala':
      html = paginaEscala();
      titulo = 'Escala — Tornadopédia';
      break;
    case 'imagens':
      html = paginaImagens();
      titulo = 'Galeria — Tornadopédia';
      break;
    case 'sobre':
      html = paginaSobre();
      break;
    case 'busca':
      html = paginaBusca(params.get('q') || '');
      break;
    case 'novo':
      html = paginaFormulario(null);
      break;
    case 'editar':
      html = paginaFormulario(partes[1]);
      break;
    case 'aleatorio': {
      const l = todos();
      location.replace(`#/t/${l[Math.floor(Math.random() * l.length)].id}`);
      return;
    }
    default:
      html = paginaNaoEncontrada(partes.join('/'));
  }

  $conteudo.innerHTML = html;
  document.title = titulo;
  pintarIlustracoes();
  document.body.classList.remove('menu-aberto');
  window.scrollTo(0, 0);

  if (partes[0] === 'novo' || partes[0] === 'editar') ligarFormulario(partes[1]);
  if (partes[0] === 'escala') {
    const v = document.getElementById('calc-v');
    const r = document.getElementById('calc-r');
    v.addEventListener('input', () => {
      if (v.value === '') return (r.innerHTML = '—');
      const e = escalaDe(classificar(Number(v.value)));
      r.innerHTML = `${selo(e.classe)} ${esc(e.nome)} <small>(${esc(e.faixa)})</small>`;
    });
  }
}

// ---------- eventos globais ----------

$conteudo.addEventListener('click', (ev) => {
  const ir = ev.target.closest('[data-ir]');
  if (ir) {
    ev.preventDefault();
    document.getElementById(ir.dataset.ir)?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const apagar = ev.target.closest('[data-apagar]');
  if (apagar && confirm('Apagar este artigo? Isso não pode ser desfeito.')) {
    salvarLocais(lerLocais().filter((a) => a.id !== apagar.dataset.apagar));
    location.hash = '#/';
  }
});

document.getElementById('busca').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = document.getElementById('busca-q').value.trim();
  if (!q) return;
  const exato = todos().find((t) => semAcento(t.nome) === semAcento(q));
  location.hash = exato ? `#/t/${exato.id}` : `#/busca?q=${encodeURIComponent(q)}`;
});

document.getElementById('menu-btn').addEventListener('click', () => document.body.classList.toggle('menu-aberto'));

document.getElementById('classes-nav').innerHTML = ESCALA.map((e) => selo(e.classe)).join('');

window.addEventListener('hashchange', rota);
rota();

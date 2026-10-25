// Telas: TeleChat (rede social) e criador de jogadores.
import { W, P, T, LG, posName, nationOf, fmtMoney, marketValue, teamAvg, SKIN_TONES, HAIR_COLORS, EYE_COLORS, HAIR_STYLES, HAIR_STYLE_NAMES, BEARDS, BEARD_NAMES, randomLook } from './world.js';
import { NATIONS, POS_INFO, TRAITS } from './data.js';
import * as Tele from './telechat.js';
import * as Career from './career.js';
import { CONTROVERSIES } from './news.js';
import { createCustomPlayer, titleOptions } from './creator.js';
import { STAR_TIERS } from './awards.js';
import { kitFor } from './avatar3d.js';
import { mountViewer, disposeViewer } from './views.js';
import * as AI from './ai.js';
import { $, $$, ovrBadge, thumbImg, toast, crest, stars, esc } from './ui.js';

// ---------- TeleChat ----------
const teleState = { limit: 40, search: '' };

function ago(abs) {
  const d = (W.absWeek || 0) - abs;
  if (d <= 0) return 'esta semana';
  if (d === 1) return 'há 1 semana';
  if (d < 20) return `há ${d} semanas`;
  return `há ${Math.round(d / 20)} temp.`;
}

function verified(p) {
  return Tele.isVerified(p) ? '<span class="tc-verified" title="Conta verificada">✔</span>' : '';
}

function author(p, fan) {
  if (fan) return `<b>@${esc(fan)}</b>`;
  if (!p) return '<b class="muted">conta desativada</b>';
  return `<a href="#/telechat/perfil/${p.id}"><b>${esc(p.name)}</b>${verified(p)}</a>`;
}

function postHTML(post) {
  const p = P(post.pid);
  if (!p) return '';
  const T0 = Tele.tele();
  const liked = T0.liked[post.id];
  const m = post.matchId && W.matches[post.matchId];
  return `<article class="tc-post" data-post="${post.id}">
    <a href="#/telechat/perfil/${p.id}">${thumbImg(p)}</a>
    <div class="tc-body">
      <div class="tc-head">${author(p)} <span class="muted small">${Tele.handle(p)} · ${ago(post.abs)}</span></div>
      <p class="tc-text">${esc(post.text)}</p>
      ${m ? `<a class="tc-match" href="#/partida/${m.id}">${crest(T(m.home), 18)} <b>${m.hg} – ${m.ag}</b> ${crest(T(m.away), 18)} <span class="muted small">${esc(m.compName)}</span></a>` : ''}
      <div class="tc-actions">
        <button class="tc-act ${liked ? 'on' : ''}" data-like="${post.id}" aria-label="Curtir">${liked ? '♥' : '♡'} ${Tele.fmtCount(post.likes + (liked ? 1 : 0))}</button>
        <span class="tc-act">🔁 ${Tele.fmtCount(post.reposts)}</span>
        <button class="tc-act" data-cm="${post.id}" aria-label="Comentários">💬 ${post.comments.length}</button>
      </div>
      <div class="tc-comments hidden" id="cm-${post.id}">${post.comments.map((c) => `<div class="tc-comment">${author(P(c.pid), c.fan)} <span>${esc(c.text)}</span></div>`).join('') || '<div class="muted small">Sem comentários.</div>'}</div>
    </div>
  </article>`;
}

function followButton(p) {
  const T0 = Tele.tele();
  if (!W.protagonistId) return '';
  if (p.isUser) return '';
  const following = T0.follows.includes(p.id);
  return `<button class="btn sm ${following ? 'ghost' : 'primary'}" data-follow="${p.id}">${following ? 'Seguindo' : 'Seguir'}</button>`;
}

function chanceLabel(p) {
  const c = Tele.followBackChance(p);
  return c >= 0.7 ? '<span class="tc-chance hi">chance alta de seguir de volta</span>' : c >= 0.3 ? '<span class="tc-chance mid">chance média</span>' : '<span class="tc-chance lo">chance baixa</span>';
}

function whoToFollow(list) {
  return list.map((p) => `<div class="tc-who">${thumbImg(p)}<div style="min-width:0;flex:1"><a href="#/telechat/perfil/${p.id}"><b>${esc(p.name)}</b>${verified(p)}</a><div class="tiny muted">${Tele.fmtCount(Tele.followerCount(p))} seguidores · ${Tele.classOf(p).name}</div>${W.protagonistId ? chanceLabel(p) : ''}</div>${followButton(p)}</div>`).join('');
}

function bindPosts(root) {
  $$('[data-like]', root).forEach((b) => (b.onclick = () => {
    const T0 = Tele.tele();
    T0.liked[b.dataset.like] = !T0.liked[b.dataset.like];
    window.save();
    window.rerender();
  }));
  $$('[data-cm]', root).forEach((b) => (b.onclick = () => $('#cm-' + b.dataset.cm, root).classList.toggle('hidden')));
  bindFollow(root);
}

function bindFollow(root) {
  $$('[data-follow]', root).forEach((b) => (b.onclick = () => {
    const pid = b.dataset.follow;
    const T0 = Tele.tele();
    const p = P(pid);
    if (T0.follows.includes(pid)) {
      Tele.unfollow(pid);
      toast(`Você deixou de seguir ${p.name}.`);
    } else {
      const r = Tele.follow(pid);
      if (r?.now) toast(`${p.name} seguiu você de volta! 🎉`, 3500);
      else if (r?.already) toast(`Agora vocês se seguem.`);
      else toast(`Você seguiu ${p.name}. Veja nas próximas semanas se ele segue de volta.`, 3500);
    }
    window.save();
    window.rerender();
  }));
}

export function viewTele(tab = 'para-voce') {
  const T0 = Tele.tele();
  T0.unread = 0;
  const me = Career.protagonist();
  const kinds = { 'para-voce': ['all', 'Para você'], seguindo: ['following', 'Seguindo'], 'em-alta': ['trending', 'Em alta'], meus: ['mine', 'Meus posts'] };
  const [kind] = kinds[tab] || kinds['para-voce'];
  const list = Tele.feed(kind);
  const q = teleState.search.trim().toLowerCase();
  const results = q ? Object.values(W.players).filter((p) => !p.retired && p.name.toLowerCase().includes(q)).slice(0, 8) : [];
  const notifs = T0.notifs.slice(0, 8);
  return {
    html: `
    <div class="page-head"><div><h1 class="tc-logo">Tele<span>Chat</span></h1><p>A rede social dos jogadores. ${Tele.tele().posts.length.toLocaleString('pt-BR')} posts publicados.</p></div>${me ? `<a class="btn" href="#/telechat/dms">✉️ Mensagens</a>` : ''}</div>
    <div class="layout-main">
      <div>
        ${me ? `<div class="card tc-compose"><div class="row" style="align-items:flex-start;flex-wrap:nowrap">${thumbImg(me)}<div style="flex:1;min-width:0"><textarea id="tc-text" rows="2" maxlength="280" placeholder="O que está acontecendo, ${esc(me.name)}?"></textarea><div class="spread" style="margin-top:8px"><div class="chips">${['Treino pago ✅💪', 'Obrigado, torcida! ❤️', 'Foco no próximo jogo 🎯', 'Rival tá chorando 😂'].map((s) => `<span class="chip" data-sug="${esc(s)}">${esc(s)}</span>`).join('')}</div><button class="btn primary sm" id="tc-post">Postar</button></div></div></div></div>` : `<a class="card" href="#/carreira" style="display:block;border-color:#7f1d3a"><b>Crie seu protagonista</b> para postar, seguir jogadores e mandar mensagens.</a>`}
        <div class="tabs" style="margin-top:14px">${Object.entries(kinds).filter(([k]) => me || k === 'para-voce' || k === 'em-alta').map(([k, [, label]]) => `<a href="#/telechat/${k}" class="${tab === k ? 'on' : ''}">${label}</a>`).join('')}</div>
        <div class="card tc-feed">${list.slice(0, teleState.limit).map(postHTML).join('') || `<div class="empty">${kind === 'following' ? 'Siga jogadores para ver os posts deles aqui.' : kind === 'mine' ? 'Você ainda não postou.' : 'Nenhum post ainda. Avance uma semana.'}</div>`}</div>
        ${list.length > teleState.limit ? '<div style="text-align:center;margin-top:14px"><button class="btn" id="tc-more">Carregar mais</button></div>' : ''}
      </div>
      <aside class="stack">
        ${me ? `<div class="card"><div class="row">${thumbImg(me, 'lg')}<div><b>${esc(me.name)}</b>${verified(me)}<div class="small muted">${Tele.handle(me)}</div></div></div><div class="kv" style="margin-top:10px"><div><small>Seguidores</small><b>${Tele.fmtCount(Tele.followerCount(me))}</b></div><div><small>Seguindo</small><b>${T0.follows.length}</b></div><div><small>Jogadores que te seguem</small><b>${T0.followers.length}</b></div></div></div>` : ''}
        <div class="card"><h3>Buscar jogadores</h3><input type="text" id="tc-search" placeholder="Nome do jogador" value="${esc(teleState.search)}"/>${results.length ? `<div style="margin-top:10px">${whoToFollow(results)}</div>` : q ? '<p class="small muted">Ninguém encontrado.</p>' : ''}</div>
        <div class="card"><h3>Quem seguir</h3><p class="tiny muted" style="margin-top:-6px">Astros raramente seguem de volta. Jogadores pouco conhecidos quase sempre seguem.</p>${whoToFollow(Tele.suggestions(6))}</div>
        ${notifs.length ? `<div class="card"><h3>Notificações</h3>${notifs.map((n) => `<a class="tc-notif" href="#/telechat/${n.type === 'dm' ? 'dm' : 'perfil'}/${n.pid}">${n.type === 'dm' ? '✉️' : '👤'} ${esc(n.text)} <span class="tiny muted">${ago(n.abs)}</span></a>`).join('')}</div>` : ''}
      </aside>
    </div>`,
    mount(root) {
      bindPosts(root);
      const more = $('#tc-more', root);
      if (more) more.onclick = () => {
        teleState.limit += 40;
        window.rerender();
      };
      const s = $('#tc-search', root);
      s.onchange = () => {
        teleState.search = s.value;
        window.rerender();
      };
      s.onkeydown = (e) => {
        if (e.key === 'Enter') s.onchange();
      };
      $$('[data-sug]', root).forEach((c) => (c.onclick = () => ($('#tc-text', root).value = c.dataset.sug)));
      const post = $('#tc-post', root);
      if (post) post.onclick = () => {
        const text = $('#tc-text', root).value.trim();
        if (!text) return toast('Escreva alguma coisa antes de postar.');
        const r = Tele.protagonistPost(text);
        let msg = `Post publicado! ${r.post.comments.length} comentário(s).`;
        if (r.provocative && Math.random() < 0.35) {
          Career.triggerControversy(me, CONTROVERSIES.find((c) => c.key === 'rede'));
          msg = 'Seu post provocativo viralizou e virou polêmica na imprensa!';
        }
        window.save();
        toast(msg, 3500);
        location.hash = '#/telechat/meus';
      };
    },
  };
}

export function viewTeleProfile(pid) {
  const p = P(pid);
  if (!p) return { html: '<div class="card empty">Conta não encontrada.</div>' };
  const T0 = Tele.tele();
  const posts = T0.posts.filter((x) => x.pid === pid);
  const followsMe = T0.followers.includes(pid);
  const following = 80 + Math.round(p.fame * 9 + (p.id.charCodeAt(2) % 40));
  const t = T(p.teamId);
  return {
    html: `
    <div class="card tc-profile" style="--c1:${t?.colors[0] || '#1e293b'}">
      <div class="tc-cover"></div>
      <div class="tc-prow">${thumbImg(p, 'xl')}<div class="row">${followButton(p)}${W.protagonistId && !p.isUser ? `<a class="btn sm" href="#/telechat/dm/${p.id}">✉️ Mensagem</a>` : ''}</div></div>
      <h2 style="margin:6px 0 0">${esc(p.name)} ${verified(p)}</h2>
      <div class="muted">${Tele.handle(p)} ${followsMe ? '<span class="chip" style="cursor:default">Segue você</span>' : ''}</div>
      <p style="margin:10px 0">${esc(Tele.bioOf(p))}</p>
      <div class="row small"><b>${Tele.fmtCount(Tele.followerCount(p))}</b> seguidores · <b>${following}</b> seguindo · <b>${posts.length}</b> posts</div>
      <div class="row" style="margin-top:10px"><span class="chip">${Tele.classOf(p).name}</span><span class="chip">Estilo: ${Tele.TONE_NAMES[Tele.toneOf(p)]}</span>${W.protagonistId && !p.isUser ? chanceLabel(p) : ''}<a class="chip" href="#/jogador/${p.id}">Ficha de jogador →</a></div>
    </div>
    <div class="card tc-feed" style="margin-top:16px">${posts.slice(0, 60).map(postHTML).join('') || '<div class="empty">Nenhum post ainda.</div>'}</div>`,
    mount: bindPosts,
  };
}

export function viewTeleInbox() {
  const T0 = Tele.tele();
  const chats = Object.entries(T0.chats).filter(([pid, c]) => c.length && P(pid)).sort((a, b) => b[1].at(-1).abs - a[1].at(-1).abs);
  return {
    html: `<div class="page-head"><div><h1 class="tc-logo">Tele<span>Chat</span> · Mensagens</h1><p>Abra o perfil de um jogador e toque em "Mensagem" para iniciar uma conversa.</p></div><a class="btn ghost" href="#/telechat">← Feed</a></div>
    <div class="card">${chats.length ? chats.map(([pid, c]) => {
      const p = P(pid);
      const last = c.at(-1);
      return `<a class="tc-who" href="#/telechat/dm/${pid}">${thumbImg(p)}<div style="flex:1;min-width:0"><b>${esc(p.name)}</b>${verified(p)}<div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${last.me ? 'Você: ' : ''}${esc(last.text)}</div></div><span class="tiny muted">${ago(last.abs)}</span></a>`;
    }).join('') : '<div class="empty">Nenhuma conversa ainda.</div>'}</div>`,
  };
}

export function viewTeleDM(pid) {
  const p = P(pid);
  const me = Career.protagonist();
  if (!p) return { html: '<div class="card empty">Conta não encontrada.</div>' };
  if (!me) return { html: '<div class="card empty">Crie seu protagonista em Carreira para mandar mensagens.</div>' };
  const chat = Tele.chatOf(pid);
  const T0 = Tele.tele();
  const quick = ['Oi! Tudo bem?', 'Você é craque demais! 🔥', 'Me dá uma dica pra evoluir?', 'Bora treinar juntos?', 'Vem jogar no meu time!', 'Seu time é muito fraco 😂'];
  const last = chat.at(-1);
  return {
    html: `
    <div class="card tc-dm">
      <div class="spread tc-dm-head"><a class="row" href="#/telechat/perfil/${p.id}">${thumbImg(p)}<div><b>${esc(p.name)}</b>${verified(p)}<div class="tiny muted">${Tele.handle(p)} · ${T0.followers.includes(p.id) ? 'segue você' : 'não segue você'} · estilo ${Tele.TONE_NAMES[Tele.toneOf(p)].toLowerCase()}</div></div></a><a class="btn sm ghost" href="#/telechat/dms">Conversas</a></div>
      <div class="tc-msgs" id="tc-msgs">${chat.map((m) => `<div class="bubble ${m.me ? 'me' : ''}">${esc(m.text)}</div>`).join('') || `<div class="empty small">Mande a primeira mensagem para ${esc(p.name)}. ${chanceLabel(p)}</div>`}
        ${last?.me ? `<div class="tiny muted" style="text-align:right">${last.seen ? 'Visto' : 'Enviada'}</div>` : ''}
        <div class="bubble typing hidden" id="tc-typing"><span></span><span></span><span></span></div>
      </div>
      <div class="chips" style="margin:10px 0">${quick.map((q) => `<span class="chip" data-q="${esc(q)}">${esc(q)}</span>`).join('')}</div>
      <form class="row" id="tc-form" style="flex-wrap:nowrap"><input type="text" id="tc-input" maxlength="400" placeholder="Escreva uma mensagem" autocomplete="off"/><button class="btn primary" type="submit">Enviar</button></form>
    </div>`,
    mount(root) {
      const box = $('#tc-msgs', root);
      box.scrollTop = box.scrollHeight;
      const input = $('#tc-input', root);
      $$('[data-q]', root).forEach((c) => (c.onclick = () => {
        input.value = c.dataset.q;
        input.focus();
      }));
      let busy = false;
      $('#tc-form', root).onsubmit = async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text || busy) return;
        busy = true;
        const res = Tele.sendDM(pid, text);
        window.save();
        input.value = '';
        const typing = $('#tc-typing', root);
        const bubble = document.createElement('div');
        bubble.className = 'bubble me';
        bubble.textContent = text;
        box.insertBefore(bubble, typing);
        box.scrollTop = box.scrollHeight;
        if (!res.replied) {
          await new Promise((r) => setTimeout(r, 1200));
          toast(Tele.followerCount(p) > 5e6 ? `${p.name} recebe milhares de mensagens e não respondeu.` : `${p.name} ${chat.at(-1).seen ? 'visualizou e não respondeu' : 'ainda não viu sua mensagem'}.`, 3200);
          busy = false;
          window.rerender();
          return;
        }
        typing.classList.remove('hidden');
        box.scrollTop = box.scrollHeight;
        let reply = res.text;
        const t0 = Date.now();
        if (W.settings.aiEnabled && W.settings.aiKey) {
          try {
            reply = await AI.dmReply(p, me, Tele.chatOf(pid), Tele.TONE_NAMES[res.tone]);
          } catch (err) {
            /* usa a resposta do motor do jogo */
          }
        }
        await new Promise((r) => setTimeout(r, Math.max(0, 900 + Math.random() * 1400 - (Date.now() - t0))));
        Tele.pushReply(pid, reply);
        if (res.followBack) {
          Tele.acceptFollowNow(pid);
          toast(`${p.name} gostou da conversa e seguiu você! 🎉`, 3500);
        }
        if (res.scandal) {
          Career.triggerControversy(me, CONTROVERSIES.find((c) => c.key === 'rede'));
          toast(`${p.name} printou a conversa e o bate-boca virou notícia!`, 4000);
        }
        window.save();
        busy = false;
        window.rerender();
      };
    },
  };
}

// ---------- criador de jogadores ----------
const PRESETS = {
  lenda: { label: 'Lenda mundial', age: 29, ovr: 93, pot: 95, fame: 97, gp: 520, goals: 410, assists: 190 },
  craque: { label: 'Craque', age: 26, ovr: 87, pot: 90, fame: 82, gp: 260, goals: 120, assists: 70 },
  promessa: { label: 'Promessa', age: 17, ovr: 66, pot: 93, fame: 28, gp: 6, goals: 2, assists: 1 },
  comum: { label: 'Jogador comum', age: 25, ovr: 71, pot: 74, fame: 35, gp: 120, goals: 18, assists: 12 },
  veterano: { label: 'Veterano', age: 34, ovr: 80, pot: 80, fame: 70, gp: 610, goals: 230, assists: 120 },
};

const cd = {
  first: '', last: '', display: '', nation: 'BRA', age: 26, pos: 'ATA', foot: 'Destro', number: 9, ovr: 87, pot: 90, fame: 82,
  traits: ['decisivo'], look: { skin: SKIN_TONES[4], hair: 'undercut', hairColor: '#111111', eyes: EYE_COLORS[1], beard: 'curta', height: 1.83, build: 1.02, boots: '#facc15' },
  teamId: null, role: 'titular', gp: 260, goals: 120, assists: 70, awards: {}, titles: {},
};

function cdTeam() {
  if (!cd.teamId || !T(cd.teamId)) cd.teamId = W.leagues[0].teamIds[0];
  return T(cd.teamId);
}

export function viewCreatePlayer() {
  const team = cdTeam();
  const sw = (key, list) => `<div class="swatches">${list.map((c) => `<span class="swatch ${cd.look[key] === c ? 'on' : ''}" data-look="${key}" data-v="${c}" style="background:${c}"></span>`).join('')}</div>`;
  const opts = (key, list, names) => `<div class="opt-grid">${list.map((v) => `<button type="button" class="opt ${cd.look[key] === v ? 'on' : ''}" data-look="${key}" data-v="${v}">${names[v]}</button>`).join('')}</div>`;
  const starter = team.squad.map(P).find((x) => x.pos === cd.pos);
  const custom = Object.values(W.teams).filter((t) => !t.leagueId);
  const teamOpts = W.leagues.map((L) => `<optgroup label="${esc(L.name)}">${L.teamIds.map(T).map((t) => `<option value="${t.id}" ${t.id === cd.teamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('') + (custom.length ? `<optgroup label="Clubes criados">${custom.map((t) => `<option value="${t.id}" ${t.id === cd.teamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>` : '');
  const awardsByStars = [5, 4, 3, 2, 1].map((s) => [s, W.awards.filter((a) => a.stars === s && a.period !== 'round')]);
  return {
    html: `
    <div class="page-head"><div><h1>Criar jogador</h1><p>Adicione ao universo uma lenda, um craque ou a promessa mais talentosa do planeta. Defina overall, personalidade, aparência, números e conquistas.</p></div></div>
    <div class="row" style="margin-bottom:14px"><span class="small muted">Modelos:</span>${Object.entries(PRESETS).map(([k, v]) => `<button class="chip" data-preset="${k}">${v.label}</button>`).join('')}</div>
    <div class="player-head">
      <div class="stack cp-side">
        <div class="viewer"><canvas id="cp-viewer"></canvas><div class="hint">prévia ao vivo</div></div>
        <div class="card"><div class="row">${ovrBadge(cd.ovr, 'big')}<div><b id="cp-name">${esc(cd.display || [cd.first, cd.last].join(' ').trim() || 'Novo jogador')}</b><div class="small muted">${posName(cd.pos)} · ${cd.age} anos · ${nationOf(cd.nation).flag}</div><div class="small">Potencial ${cd.pot} · Fama ${cd.fame}</div></div></div></div>
      </div>
      <div class="stack">
        <div class="card"><h3>Identidade</h3><div class="grid g2">
          <div class="field"><label for="cp-first">Nome</label><input type="text" id="cp-first" data-f="first" maxlength="18" value="${esc(cd.first)}" placeholder="Ex.: Rafael"/></div>
          <div class="field"><label for="cp-last">Sobrenome</label><input type="text" id="cp-last" data-f="last" maxlength="20" value="${esc(cd.last)}" placeholder="Ex.: Montenegro"/></div>
          <div class="field"><label for="cp-display">Nome de camisa / apelido</label><input type="text" id="cp-display" data-f="display" maxlength="18" value="${esc(cd.display)}" placeholder="Opcional"/></div>
          <div class="field"><label for="cp-nation">Nacionalidade</label><select id="cp-nation" data-f="nation">${Object.entries(NATIONS).map(([k, n]) => `<option value="${k}" ${cd.nation === k ? 'selected' : ''}>${n.flag} ${n.name}</option>`).join('')}</select></div>
          <div class="field"><label for="cp-pos">Posição</label><select id="cp-pos" data-f="pos" data-re="1">${Object.entries(POS_INFO).map(([k, v]) => `<option value="${k}" ${cd.pos === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
          <div class="field"><label for="cp-foot">Pé preferido</label><select id="cp-foot" data-f="foot"><option ${cd.foot === 'Destro' ? 'selected' : ''}>Destro</option><option ${cd.foot === 'Canhoto' ? 'selected' : ''}>Canhoto</option></select></div>
          <div class="field"><label for="cp-age">Idade: <b data-show="age">${cd.age}</b></label><input type="range" id="cp-age" data-f="age" data-num="1" min="16" max="40" value="${cd.age}"/></div>
          <div class="field"><label for="cp-number">Número</label><input type="number" id="cp-number" data-f="number" data-num="1" min="1" max="99" value="${cd.number}"/></div>
        </div></div>
        <div class="card"><h3>Nível e fama</h3>
          <div class="field"><label for="cp-ovr">Overall: <b data-show="ovr">${cd.ovr}</b></label><input type="range" id="cp-ovr" data-f="ovr" data-num="1" min="40" max="99" value="${cd.ovr}"/></div>
          <div class="field"><label for="cp-pot">Potencial: <b data-show="pot">${cd.pot}</b></label><input type="range" id="cp-pot" data-f="pot" data-num="1" min="40" max="99" value="${cd.pot}"/></div>
          <div class="field"><label for="cp-fame">Fama: <b data-show="fame">${cd.fame}</b> <span class="tiny muted">(define seguidores no TeleChat e chance de seguir de volta)</span></label><input type="range" id="cp-fame" data-f="fame" data-num="1" min="1" max="99" value="${cd.fame}"/></div>
        </div>
        <div class="card"><h3>Personalidade (até 2)</h3><div class="opt-grid">${Object.entries(TRAITS).map(([k, t]) => `<button type="button" class="opt ${cd.traits.includes(k) ? 'on' : ''}" data-trait="${k}" title="${esc(t.desc)}">${t.name}</button>`).join('')}</div><p class="tiny muted" style="margin-top:8px">A personalidade define o jeito de postar e de responder no TeleChat e a chance de polêmicas.</p></div>
        <div class="card"><h3>Aparência</h3>
          <div class="field"><label>Tom de pele</label>${sw('skin', SKIN_TONES)}</div>
          <div class="field"><label>Cabelo</label>${opts('hair', HAIR_STYLES, HAIR_STYLE_NAMES)}</div>
          <div class="field"><label>Cor do cabelo</label>${sw('hairColor', HAIR_COLORS)}</div>
          <div class="field"><label>Cor dos olhos</label>${sw('eyes', EYE_COLORS)}</div>
          <div class="field"><label>Barba</label>${opts('beard', BEARDS, BEARD_NAMES)}</div>
          <div class="grid g2"><div class="field"><label for="cp-h">Altura</label><input type="range" id="cp-h" min="1.62" max="2.02" step="0.01" value="${cd.look.height}"/></div><div class="field"><label for="cp-b">Porte físico</label><input type="range" id="cp-b" min="0.88" max="1.18" step="0.01" value="${cd.look.build}"/></div></div>
          <div class="field"><label>Chuteira</label>${sw('boots', ['#111111', '#ffffff', '#e11d48', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#06b6d4', '#facc15'])}</div>
          <button type="button" class="btn sm" id="cp-rand">🎲 Aparência aleatória</button>
        </div>
        <div class="card"><h3>Clube</h3><div class="grid g2">
          <div class="field"><label for="cp-team">Clube</label><select id="cp-team">${teamOpts}</select></div>
          <div class="field"><label for="cp-role">Função</label><select id="cp-role"><option value="titular" ${cd.role === 'titular' ? 'selected' : ''}>Titular</option><option value="reserva" ${cd.role === 'reserva' ? 'selected' : ''}>Reserva</option></select></div>
        </div><p class="small muted" style="margin:0">${cd.role === 'titular' && starter ? `Como titular, entra no lugar de <b>${esc(starter.name)}</b> (${starter.ovr}), que vai para o banco.` : 'Como reserva, entra no segundo tempo de alguns jogos.'}</p></div>
        <div class="card"><h3>Números da carreira</h3><div class="grid g3">
          <div class="field"><label for="cp-gp">Jogos</label><input type="number" id="cp-gp" data-f="gp" data-num="1" min="0" max="2000" value="${cd.gp}"/></div>
          <div class="field"><label for="cp-goals">Gols</label><input type="number" id="cp-goals" data-f="goals" data-num="1" min="0" max="2000" value="${cd.goals}"/></div>
          <div class="field"><label for="cp-assists">Assistências</label><input type="number" id="cp-assists" data-f="assists" data-num="1" min="0" max="2000" value="${cd.assists}"/></div>
        </div></div>
        <div class="card"><h3>Prêmios conquistados</h3><p class="tiny muted" style="margin-top:-6px">Quantas vezes ganhou cada prêmio antes de chegar ao universo.</p>
          ${awardsByStars.map(([s, list]) => list.length ? `<div class="cp-group"><div class="small">${stars(s)} ${STAR_TIERS[s].label}</div>${list.map((a) => `<label class="cp-count"><span>${esc(a.name)}</span><input type="number" min="0" max="30" data-award="${a.id}" value="${cd.awards[a.id] || 0}"/></label>`).join('')}</div>` : '').join('')}
        </div>
        <div class="card"><h3>Títulos</h3>${titleOptions().map((t) => `<label class="cp-count"><span>${stars(t.stars)} ${esc(t.name)}</span><input type="number" min="0" max="30" data-title="${t.key}" value="${cd.titles[t.key] || 0}"/></label>`).join('')}</div>
        <button class="btn primary" id="cp-save" style="width:100%;padding:12px">➕ Adicionar ao universo</button>
      </div>
    </div>`,
    mount(root) {
      disposeViewer();
      const preview = () => ({ name: cd.display || cd.last || 'Jogador', last: cd.last || cd.display || 'Jogador', number: cd.number, look: cd.look, teamId: cd.teamId });
      const v = mountViewer($('#cp-viewer', root), preview());
      const refresh = () => {
        const t = cdTeam();
        v?.setFigure(cd.look, kitFor(preview(), t), t.colors[0] === '#ffffff' ? t.colors[1] : t.colors[0]);
      };
      $$('[data-f]', root).forEach((el) => {
        el.addEventListener('input', () => {
          cd[el.dataset.f] = el.dataset.num ? Number(el.value) || 0 : el.value.trim();
          if (el.dataset.f === 'ovr' && cd.pot < cd.ovr) cd.pot = cd.ovr;
          const show = $(`[data-show="${el.dataset.f}"]`, root);
          if (show) show.textContent = el.value;
          if (['first', 'last', 'display'].includes(el.dataset.f)) $('#cp-name', root).textContent = cd.display || [cd.first, cd.last].join(' ').trim() || 'Novo jogador';
          if (el.dataset.f === 'number') refresh();
        });
        el.addEventListener('change', () => {
          if (el.dataset.re || ['ovr', 'pot', 'fame', 'age', 'nation'].includes(el.dataset.f)) window.rerender();
        });
      });
      $('#cp-h', root).oninput = (e) => {
        cd.look.height = Number(e.target.value);
        refresh();
      };
      $('#cp-b', root).oninput = (e) => {
        cd.look.build = Number(e.target.value);
        refresh();
      };
      $$('[data-look]', root).forEach((el) => (el.onclick = () => {
        cd.look[el.dataset.look] = el.dataset.v;
        $$(`[data-look="${el.dataset.look}"]`, root).forEach((x) => x.classList.toggle('on', x === el));
        refresh();
      }));
      $$('[data-trait]', root).forEach((el) => (el.onclick = () => {
        const k = el.dataset.trait;
        cd.traits = cd.traits.includes(k) ? cd.traits.filter((x) => x !== k) : [...cd.traits, k].slice(-2);
        window.rerender();
      }));
      $$('[data-preset]', root).forEach((el) => (el.onclick = () => {
        const pr = PRESETS[el.dataset.preset];
        Object.assign(cd, { age: pr.age, ovr: pr.ovr, pot: pr.pot, fame: pr.fame, gp: pr.gp, goals: pr.goals, assists: pr.assists });
        if (el.dataset.preset === 'lenda') {
          cd.awards = { 'bola-ouro': 3, 'coroa-mundial': 2, 'chuteira-ouro': 2, 'melhor-liga': 4, 'artilheiro-liga': 5 };
          cd.titles = { 'L:PL': 4, CS: 2, NAT: 1 };
        } else if (el.dataset.preset === 'craque') {
          cd.awards = { 'melhor-liga': 1, 'artilheiro-liga': 2, 'jogador-mes': 4 };
          cd.titles = { 'L:LL': 2, CS: 1 };
        } else {
          cd.awards = el.dataset.preset === 'promessa' ? { 'revelacao-regional': 1 } : {};
          cd.titles = el.dataset.preset === 'veterano' ? { 'L:BR': 3, CONT: 1 } : {};
        }
        window.rerender();
      }));
      $('#cp-rand', root).onclick = () => {
        const r = randomLook(cd.nation);
        Object.assign(cd.look, { skin: r.skin, hair: r.hair, hairColor: r.hairColor, eyes: r.eyes, beard: r.beard });
        window.rerender();
      };
      $('#cp-team', root).onchange = (e) => {
        cd.teamId = e.target.value;
        window.rerender();
      };
      $('#cp-role', root).onchange = (e) => {
        cd.role = e.target.value;
        window.rerender();
      };
      $$('[data-award]', root).forEach((el) => (el.oninput = () => (cd.awards[el.dataset.award] = Math.max(0, Math.min(30, Number(el.value) || 0)))));
      $$('[data-title]', root).forEach((el) => (el.oninput = () => (cd.titles[el.dataset.title] = Math.max(0, Math.min(30, Number(el.value) || 0)))));
      $('#cp-save', root).onclick = () => {
        if (!cd.first || !cd.last) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return toast('Preencha nome e sobrenome do jogador.');
        }
        const p = createCustomPlayer({ ...cd, display: cd.display || `${cd.first} ${cd.last.split(' ').pop()}`, pot: Math.max(cd.pot, cd.ovr), look: { ...cd.look } });
        Object.assign(cd, { first: '', last: '', display: '', awards: {}, titles: {} });
        window.save();
        toast(`${p.name} foi adicionado ao universo!`, 3500);
        location.hash = `#/jogador/${p.id}`;
      };
    },
  };
}

export { fmtMoney, marketValue, teamAvg, LG };

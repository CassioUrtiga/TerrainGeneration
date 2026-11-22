let canvas = document.getElementById('tela');
let caneta = canvas.getContext('2d', { alpha: false });

const teclado = {
    cima: false,
    baixo: false,
    direita: false,
    esquerda: false,
    space: false,
    eventos: [],   // ações de um toque só: 'usar', 'pegar', 'soltar', 'slot0'..'slot2', 'reviver', 'clique'
}

// Ações (um toque): 1-3 trocam de slot, F usa/ataca, E pega, Q solta, R revive
const mapaAcoes = {
    Digit1: 'slot0', Digit2: 'slot1', Digit3: 'slot2',
    Numpad1: 'slot0', Numpad2: 'slot1', Numpad3: 'slot2',
    KeyF: 'usar', KeyE: 'pegar', KeyQ: 'soltar', KeyR: 'reviver',
}

// Setas ou WASD
const mapaTeclas = {
    ArrowUp: 'cima',       KeyW: 'cima',
    ArrowDown: 'baixo',    KeyS: 'baixo',
    ArrowRight: 'direita', KeyD: 'direita',
    ArrowLeft: 'esquerda', KeyA: 'esquerda',
    Space: 'space',
}

function atualizarTecla(evt, valor) {
    if (valor && !evt.repeat && mapaAcoes[evt.code]) {
        teclado.eventos.push(mapaAcoes[evt.code]);
        evt.preventDefault();
        return;
    }
    const tecla = mapaTeclas[evt.code];
    if (!tecla) return;
    teclado[tecla] = valor;
    evt.preventDefault(); // evita rolar a página / mexer nos sliders
}

window.addEventListener('keydown', (evt) => atualizarTecla(evt, true));
window.addEventListener('keyup', (evt) => atualizarTecla(evt, false));
window.addEventListener('blur', () => {
    for (const k in teclado) if (typeof teclado[k] === 'boolean') teclado[k] = false;
});

function ajustarCanvas() {
    canvas.width = window.innerWidth - 500;
    canvas.height = window.innerHeight - 40;
}

// ============ Inicialização do jogo ============

ajustarCanvas();
window.addEventListener('resize', ajustarCanvas);

const padEl = document.getElementById('directional-pad');
const joystick = new Joystick(padEl);
const personagem = new Personagem(caneta, teclado);
const checkPersonagem = document.getElementById('personagemAtivo');
if (!checkPersonagem) {
    console.warn('Switch #personagemAtivo não encontrado no HTML: personagem ligado por padrão.');
}
const personagemLigado = () => (checkPersonagem ? checkPersonagem.checked : true);

// se o switch estiver marcado o personagem entra no terreno; senão fica null
const jogo = new Jogo(caneta, canvas, teclado, personagem);
let terreno = new GerarTerreno(caneta, joystick, personagemLigado() ? personagem : null, jogo);

// Mouse: botão esquerdo anda até o ponto clicado (segure e arraste: o personagem segue o mouse);
// botão direito usa o item da mão (ataca / come); clicar num slot da hotbar escolhe o item.
let seguindoMouse = false;

function posicaoNoCanvas(evt) {
    const r = canvas.getBoundingClientRect();
    return [(evt.clientX - r.left) * canvas.width / r.width, (evt.clientY - r.top) * canvas.height / r.height];
}

function irPara(evt) {
    if (!jogo.ativo) return;                       // sem personagem não há quem andar
    const [x, y] = posicaoNoCanvas(evt);
    const alvo = terreno.telaParaGrade(x, y);
    if (alvo) personagem.destino = alvo;
}

canvas.addEventListener('pointerdown', (evt) => {
    const [x, y] = posicaoNoCanvas(evt);
    const slot = jogo.hud.slotEm(x, y, canvas);
    if (slot >= 0) { teclado.eventos.push('slot' + slot); return; }
    if (evt.button === 2 || personagem.morto) { teclado.eventos.push('clique'); return; }  // atacar / reviver
    if (evt.button !== 0) return;
    seguindoMouse = true;
    canvas.setPointerCapture(evt.pointerId);
    irPara(evt);
});
canvas.addEventListener('pointermove', (evt) => { if (seguindoMouse) irPara(evt); });
const soltarMouse = () => { seguindoMouse = false; };
canvas.addEventListener('pointerup', soltarMouse);
canvas.addEventListener('pointercancel', soltarMouse);
canvas.addEventListener('contextmenu', (evt) => evt.preventDefault());

if (checkPersonagem) {
    checkPersonagem.addEventListener('change', () => {
        terreno.definirPersonagem(personagemLigado() ? personagem : null);
    });
}

// duplo clique no joystick volta para a vista isométrica original
padEl.addEventListener('dblclick', () => terreno.resetarVista());

function inicializar() {
    // o terreno limpa o canvas e desenha personagem, NPCs e itens junto com os tiles
    terreno.desenhar();

    // interface (vida e hotbar) por cima; sem personagem, descarta as ações pendentes
    if (jogo.ativo) jogo.desenharHud();
    else teclado.eventos.length = 0;

    requestAnimationFrame(inicializar)
}

inicializar();

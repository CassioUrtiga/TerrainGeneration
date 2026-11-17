let canvas = document.getElementById('tela');
let caneta = canvas.getContext('2d', { alpha: false });

const teclado = {
    cima: false,
    baixo: false,
    direita: false,
    esquerda: false,
    space: false,
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
    const tecla = mapaTeclas[evt.code];
    if (!tecla) return;
    teclado[tecla] = valor;
    evt.preventDefault(); // evita rolar a página / mexer nos sliders
}

window.addEventListener('keydown', (evt) => atualizarTecla(evt, true));
window.addEventListener('keyup', (evt) => atualizarTecla(evt, false));
window.addEventListener('blur', () => {
    for (const k in teclado) teclado[k] = false;
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
let terreno = new GerarTerreno(caneta, joystick, personagemLigado() ? personagem : null);

if (checkPersonagem) {
    checkPersonagem.addEventListener('change', () => {
        terreno.definirPersonagem(personagemLigado() ? personagem : null);
    });
}

// duplo clique no joystick volta para a vista isométrica original
padEl.addEventListener('dblclick', () => terreno.resetarVista());

function inicializar() {
    // o terreno limpa o canvas e desenha o personagem junto com os tiles
    terreno.desenhar();

    requestAnimationFrame(inicializar)
}

inicializar();

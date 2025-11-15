let canvas = document.getElementById('tela');
let caneta = canvas.getContext('2d');

const teclado = {
    cima: false,
    baixo: false,
    direita: false,
    esquerda: false,
    space: false,
}

window.addEventListener('keydown', (evt) =>{
    switch (keyPressed(evt)){
        case '&':
            teclado.cima = true;
            break;
        case '(':
            teclado.baixo = true;
            break;
        case "'":
            teclado.direita = true;
            break;
        case '%':
            teclado.esquerda = true;
            break;
        case ' ':
            teclado.space = true;
            break;
        default:
            break;
    }
})

window.addEventListener('keyup', (evt) =>{
    switch (keyPressed(evt)){
        case '&':
            teclado.cima = false;
            break;
        case '(':
            teclado.baixo = false;
            break;
        case "'":
            teclado.direita = false;
            break;
        case '%':
            teclado.esquerda = false;
            break;
        case ' ':
            teclado.space = false;
            break;
        default:
            break;
    }
})

function keyPressed(evt){
    evt = evt || window.event;
    var key = evt.keyCode || evt.which;
    return String.fromCharCode(key); 
}

function ajustarCanvas() {
    canvas.width = window.innerWidth - 500;
    canvas.height = window.innerHeight - 40;
}


// ============ Inicialização do jogo ============

ajustarCanvas();

let terreno = new GerarTerreno(caneta);

function inicializar(){
    caneta.clearRect(0, 0, canvas.width, canvas.height);

    terreno.display();
    terreno.desenhar();
    
    requestAnimationFrame(inicializar)
}

inicializar();
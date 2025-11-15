class TerrenoIsometrico {
    constructor(caneta, linhas, colunas) {
        this.algoritmo = new Algoritmo();

        const tela = document.getElementById("tela");
        this.telaWidth = tela.width;
        this.telaHeight = tela.height;

        this.caneta = caneta;
        this.linhas = linhas;
        this.colunas = colunas;

        // parâmetros do terreno
        this.amplitude = 0;
        this.frequencia = 0;
        this.alturaBase = 150;
        this.scale = 0.15;
        this.algoritmoTerreno = 0;
        this.velocidade = 0.03;

        // parâmetros dos tiles
        this.w = 222;
        this.h = 256;
        this.tileWidth = this.w * this.scale;
        this.tileHeight = this.h * this.scale / 2;

        this.tempo = 0;
        requestAnimationFrame(() => this.animar());
    }

    desenharTileBase(x, yBase, w, h, corTopo, corLado, esticamento) {
        const ctx = this.caneta;
        const halfW = w / 2;
        const halfH = h / 2;

        // altura total do tile (esticado)
        const alturaTotal = h + esticamento;

        // topo do tile sobe proporcional à altura
        const yTopo = yBase - alturaTotal;

        // desenha o topo
        ctx.beginPath();
        ctx.moveTo(x, yTopo);
        ctx.lineTo(x + halfW, yTopo + halfH);
        ctx.lineTo(x, yTopo + h);
        ctx.lineTo(x - halfW, yTopo + halfH);
        ctx.closePath();
        ctx.fillStyle = corTopo;
        ctx.fill();

        // lado esquerdo
        ctx.beginPath();
        ctx.moveTo(x - halfW, yTopo + halfH);
        ctx.lineTo(x, yTopo + h);
        ctx.lineTo(x, yBase);
        ctx.lineTo(x - halfW, yBase - halfH);
        ctx.closePath();
        ctx.fillStyle = corLado;
        ctx.fill();

        // lado direito
        ctx.beginPath();
        ctx.moveTo(x, yTopo + h);
        ctx.lineTo(x + halfW, yTopo + halfH);
        ctx.lineTo(x + halfW, yBase - halfH);
        ctx.lineTo(x, yBase);
        ctx.closePath();
        ctx.fillStyle = this.escurecer(corLado, 0.2);
        ctx.fill();
    }

    desenhar() {
        for (let i = 0; i < this.linhas; i++) {
            for (let j = 0; j < this.colunas; j++) {
                const x = (i - j) * (this.tileWidth / 2) + this.telaWidth / 2;
                const yBase = (i + j) * (this.tileHeight / 2) + this.alturaBase;

                const altura = Math.max(0, this.algoritmo.algoritmo(
                    i, 
                    j, 
                    this.algoritmoTerreno, 
                    this.frequencia, 
                    this.tempo, 
                    this.amplitude
                ));
                const corTopo = this.alturaCor(altura);
                const corLado = "#7a614c";

                this.desenharTileBase(x, yBase, this.tileWidth, this.tileHeight, corTopo, corLado, altura);
            }
        }
    }

    animar() {
        this.tempo += this.velocidade;
        this.desenhar();
        requestAnimationFrame(() => this.animar());
    }

    alturaCor(altura) {
        // cor baseada na altura
        const verde = Math.max(0, Math.min(255, 120 + altura * 1.5));
        const r = 60 + altura / 4;
        const g = verde;
        const b = 60;
        return `rgb(${r},${g},${b})`;
    }

    escurecer(cor, fator) {
        const rgb = cor.match(/\d+/g).map(Number);
        return `rgb(${rgb[0] * (1 - fator)}, ${rgb[1] * (1 - fator)}, ${rgb[2] * (1 - fator)})`;
    }

    set setAmplitude(valor){
        this.amplitude = valor;
    }

    set setFrequencia(valor){
        this.frequencia = valor;
    }

    set setAlgoritmoTerreno(valor) {
        this.algoritmoTerreno = valor;
    }

    set setVelocidade(valor) {
        this.velocidade = valor;
    }

}

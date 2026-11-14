class Personagem {
    constructor(caneta, teclado) {
        this.caneta = caneta;
        this.teclado = teclado;

        this.img = new Image();
        this.img.src = "personagem/avatar.png";

        this.escala = 0.3;
        this.x = 100;
        this.y = 325;
        this.velocidade = 1;

        this.estado = -1; // guarda o estado atual do sprite
        this.numSprite = 0; // número do sprite atual
        this.alternaSprite = 0; // alterna entre o eixo x do sprite
        this.contadorAtraso = 0;
    }

    desenhar() {
        // animação subir
        if (this.teclado.cima) {
            this.y -= this.velocidade;
            this.estado = 1;
            this.animation(this.img, 5, 10, 780, 120, 130);
        }
        // animação parado de costas
        if (!this.teclado.cima && this.estado == 1) {
            this.animation(this.img, 0, 1, 260, 120, 130);
        }
        // animação descer
        if (this.teclado.baixo) {
            this.y += this.velocidade;
            this.estado = -1;
            this.animation(this.img, 5, 10, 520, 120, 130);
        }
        // animação parado de frente
        if (!this.teclado.baixo && this.estado == -1) {
            this.animation(this.img, 50, 3, 0, 120, 130);
        }
        // animação indo para direita
        if (this.teclado.direita) {
            this.x += this.velocidade;
            this.y -= this.velocidade/2;
            this.estado = 2;
            this.animation(this.img, 5, 10, 910, 120, 130);
        }
        // animação parado na direita
        if (!this.teclado.direita && this.estado == 2) {
            this.animation(this.img, 50, 3, 390, 120, 130);
        }
        // animação indo para esquerda
        if (this.teclado.esquerda) {
            this.x -= this.velocidade;
            this.estado = -2;
            this.animation(this.img, 5, 10, 650, 120, 130);
        }
        // animação parado na esquerda
        if (!this.teclado.esquerda && this.estado == -2) {
            this.animation(this.img, 50, 3, 130, 120, 130);
        }
    }

    animation(img, atrasoSprite, totalSprite, ySprite, tamX, tamY) {
        this.contadorAtraso++;

        if (this.contadorAtraso >= atrasoSprite || this.numSprite > totalSprite - 1) {
            this.numSprite++;
            this.contadorAtraso = 0;

            if (this.numSprite > totalSprite - 1) {
                this.numSprite = 0;
            }
            this.alternaSprite = this.numSprite * tamX;
        }

        // Calcula a largura e altura finais com base na escala
        const larguraFinal = tamX * this.escala;
        const alturaFinal = tamY * this.escala;

        // Renderiza no canvas utilizando o tamanho escalado
        this.caneta.drawImage(
            img,
            this.alternaSprite, ySprite, // Posição de corte no spritesheet
            tamX, tamY,                 // Tamanho original do corte
            this.x, this.y,             // Posição no canvas
            larguraFinal, alturaFinal   // Tamanho desenhado com a escala aplicada
        );
    }
}
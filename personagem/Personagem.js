class Personagem {
    constructor(caneta, teclado) {
        this.caneta = caneta;
        this.teclado = teclado;

        this.img = new Image();
        this.img.src = "personagem/avatar.png";

        this.escala = 0.30;
        this.offsetPes = 2;

        this.gx = null;
        this.gy = null;
        this.z = 0;

        this.velocidade = 0.06;   // tiles por frame
        this.raio = 0.22;         // "pegada" do personagem, em tiles
        this.passoMax = 14;       // maior degrau que ele consegue subir (unidades do mundo)

        // Sprite
        this.estado = -1;         // 1 costas | -1 frente | 2 direita | -2 esquerda
        this.movendo = false;
        this.numSprite = 0;
        this.alternaSprite = 0;
        this.contadorAtraso = 0;

        // [atraso, totalFrames, linhaDoSpritesheet]
        this.animacoes = {
            1:  { andar: [5, 10, 780], parado: [0, 1, 260] },
            [-1]: { andar: [5, 10, 520], parado: [50, 3, 0] },
            2:  { andar: [5, 10, 910], parado: [50, 3, 390] },
            [-2]: { andar: [5, 10, 650], parado: [50, 3, 130] },
        };
    }

    posicionarInicio(terreno) {
        this.gx = Math.floor(terreno.linhas / 2);
        this.gy = Math.floor(terreno.colunas / 2);
        this.z = terreno.alturaTile(this.gx, this.gy);
    }

    // Tiles tocados pela pegada do personagem; null se sair do mapa
    tilesPegada(terreno, gx, gy) {
        const r = this.raio;
        const cantos = [[gx - r, gy - r], [gx + r, gy - r], [gx + r, gy + r], [gx - r, gy + r]];
        const tiles = [];
        for (const [px, py] of cantos) {
            const i = Math.round(px), j = Math.round(py);
            if (i < 0 || i >= terreno.linhas || j < 0 || j >= terreno.colunas) return null;
            tiles.push([i, j]);
        }
        return tiles;
    }

    // Colisão: dentro do mapa e sem degrau alto demais
    livre(terreno, gx, gy) {
        const tiles = this.tilesPegada(terreno, gx, gy);
        if (!tiles) return false;
        for (const [i, j] of tiles) {
            if (terreno.alturaTile(i, j) - this.z > this.passoMax) return false;
        }
        return true;
    }

    alturaChao(terreno, gx, gy) {
        const tiles = this.tilesPegada(terreno, gx, gy);
        if (!tiles) return this.z;
        return Math.max(...tiles.map(([i, j]) => terreno.alturaTile(i, j)));
    }

    // Movimento + colisão. Chamado pelo terreno a cada frame, com a câmera atual (yaw).
    atualizar(terreno, yaw) {
        if (this.gx === null) this.posicionarInicio(terreno);

        const t = this.teclado;
        const ex = (t.direita ? 1 : 0) - (t.esquerda ? 1 : 0); // direção na TELA
        const ey = (t.baixo ? 1 : 0) - (t.cima ? 1 : 0);
        this.movendo = ex !== 0 || ey !== 0;

        if (this.movendo) {
            if (ex !== 0) this.estado = ex > 0 ? 2 : -2;
            else this.estado = ey > 0 ? -1 : 1;

            // direção da tela -> direção no chão (compensa a rotação da câmera)
            const len = Math.hypot(ex, ey);
            const vx = ex / len, vy = ey / len;
            const c = Math.cos(yaw), s = Math.sin(yaw);
            const dx = (vx * c + vy * s) * this.velocidade;
            const dy = (-vx * s + vy * c) * this.velocidade;

            // eixos separados: permite deslizar ao longo de paredes
            if (this.livre(terreno, this.gx + dx, this.gy)) this.gx += dx;
            if (this.livre(terreno, this.gx, this.gy + dy)) this.gy += dy;
        }

        // acompanha a altura do chão (o terreno se move, então isso roda sempre)
        const chao = this.alturaChao(terreno, this.gx, this.gy);
        this.z += (chao - this.z) * 0.4;
        if (Math.abs(chao - this.z) < 0.05) this.z = chao;
    }

    // Desenha com os pés em (sx, sy) na tela
    desenharEm(sx, sy, sinP) {
        const ctx = this.caneta;

        // sombra achatada no tile
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.beginPath();
        ctx.ellipse(sx, sy, 8, Math.max(1.5, 8 * sinP), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const anim = this.animacoes[this.estado];
        const [atraso, total, ySprite] = this.movendo ? anim.andar : anim.parado;
        this.animation(this.img, atraso, total, ySprite, 120, 130, sx, sy);
    }

    animation(img, atrasoSprite, totalSprite, ySprite, tamX, tamY, px, py) {
        this.contadorAtraso++;

        if (this.contadorAtraso >= atrasoSprite || this.numSprite > totalSprite - 1) {
            this.numSprite++;
            this.contadorAtraso = 0;
            if (this.numSprite > totalSprite - 1) this.numSprite = 0;
            this.alternaSprite = this.numSprite * tamX;
        }

        if (!img.complete || img.naturalWidth === 0) return;

        const larguraFinal = tamX * this.escala;
        const alturaFinal = tamY * this.escala;

        this.caneta.drawImage(
            img,
            this.alternaSprite, ySprite,
            tamX, tamY,
            px - larguraFinal / 2, py - alturaFinal + this.offsetPes,
            larguraFinal, alturaFinal
        );
    }
}

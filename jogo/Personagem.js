class Personagem {
    constructor(caneta, teclado) {
        this.caneta = caneta;
        this.teclado = teclado;
        this.escala = 1;

        // Posição em coordenadas de grade (i = linha, j = coluna, podem ser fracionárias)
        // e altura z (mesma unidade do mundo do terreno)
        this.gx = null;
        this.gy = null;
        this.z = 0;
        this.chaoZ = 0;           // altura do chão logo abaixo dele (para a sombra)

        this.velocidade = 0.06;   // tiles por frame
        this.raio = 0.22;         // "pegada" do personagem, em tiles
        this.passoMax = 14;       // maior degrau que ele sobe andando (pulando sobe mais)

        // Pulo
        this.gravidade = 0.35;    // queda por frame
        this.forcaPulo = 5.2;     // impulso inicial (altura do pulo ≈ forca² / (2 × gravidade))
        this.vz = 0;
        this.noChao = true;
        this.bufferPulo = 0;      // aceita o "pular" apertado um pouco antes de aterrissar
        this.espacoAntes = false;
        this.achata = 0;          // >0 achatado (aterrissagem), <0 esticado (decolagem)

        // Vida e combate
        this.vidaMax = 10;
        this.vida = 10;
        this.morto = false;
        this.invul = 0;           // frames de invulnerabilidade após levar dano
        this.flashDano = 0;
        this.kx = 0; this.ky = 0; // empurrão
        this.dirGx = 0; this.dirGy = 1;   // para onde olha, no chão (alvo dos ataques)
        this.golpeT = 0; this.golpeDur = 14;
        this.armaTipo = null;     // arma na mão (definida pelo Jogo)
        this.armaTiro = false;

        // Animação
        this.estado = -1;         // 1 costas | -1 frente | 2 direita | -2 esquerda
        this.movendo = false;
        this.fase = 0;            // fase do ciclo de caminhada
        this.tempoAnim = 0;

        this.cores = {
            pele: "#f2c9a0", cabelo: "#4a2f1f", camisa: "#3f7fd6", camisaEscura: "#2f64ad",
            calca: "#2f3a55", calcaEscura: "#232b42", sapato: "#1d202b", mochila: "#c0793a",
            contorno: "#202433",
        };
    }

    // ================== lógica ==================

    posicionarInicio(terreno) {
        this.gx = 0;
        this.gy = 0;
        this.z = terreno.alturaTile(this.gx, this.gy);
        this.chaoZ = this.z;
        this.noChao = true;
    }

    // Tiles tocados pela pegada do personagem (o mundo é infinito, sem limites)
    tilesPegada(terreno, gx, gy) {
        const r = this.raio;
        const cantos = [[gx - r, gy - r], [gx + r, gy - r], [gx + r, gy + r], [gx - r, gy + r]];
        return cantos.map(([px, py]) => [Math.round(px), Math.round(py)]);
    }

    // Colisão: bloqueia degraus altos demais e tiles com obstáculo (árvore, pedra...)
    livre(terreno, gx, gy) {
        const tiles = this.tilesPegada(terreno, gx, gy);
        const atuais = this.tilesPegada(terreno, this.gx, this.gy);
        for (const [i, j] of tiles) {
            if (terreno.alturaTile(i, j) - this.z > this.passoMax) return false;
            // (se já está sobre um tile com obstáculo, pode sair dele)
            if (terreno.temObstaculo && terreno.temObstaculo(i, j) &&
                !atuais.some(([a, b]) => a === i && b === j)) return false;
        }
        return true;
    }

    alturaChao(terreno, gx, gy) {
        const tiles = this.tilesPegada(terreno, gx, gy);
        return Math.max(...tiles.map(([i, j]) => terreno.alturaTile(i, j)));
    }

    // Movimento, colisão e pulo. Chamado pelo terreno a cada frame, com a câmera atual (yaw).
    atualizar(terreno, yaw) {
        if (this.gx === null) this.posicionarInicio(terreno);
        this.tempoAnim++;

        const t = this.morto ? {} : this.teclado;
        if (this.invul > 0) this.invul--;
        if (this.flashDano > 0) this.flashDano--;
        if (this.golpeT > 0) this.golpeT--;

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
        if (this.movendo && this.noChao) this.fase += 0.3;

        // direção do olhar no chão (os ataques vão para lá)
        const vxs = this.estado === 2 ? 1 : this.estado === -2 ? -1 : 0;
        const vys = this.estado === -1 ? 1 : this.estado === 1 ? -1 : 0;
        const cyw = Math.cos(yaw), syw = Math.sin(yaw);
        this.dirGx = vxs * cyw + vys * syw;
        this.dirGy = -vxs * syw + vys * cyw;

        // empurrão ao levar dano
        if (Math.abs(this.kx) + Math.abs(this.ky) > 0.003) {
            if (this.livre(terreno, this.gx + this.kx, this.gy)) this.gx += this.kx;
            if (this.livre(terreno, this.gx, this.gy + this.ky)) this.gy += this.ky;
            this.kx *= 0.82; this.ky *= 0.82;
        }

        // ---- pulo ----
        if (t.space && !this.espacoAntes) this.bufferPulo = 6;
        this.espacoAntes = t.space;
        if (this.bufferPulo > 0) this.bufferPulo--;

        const chao = this.alturaChao(terreno, this.gx, this.gy);
        this.chaoZ = chao;

        if (this.noChao) {
            if (this.bufferPulo > 0) {
                this.vz = this.forcaPulo;
                this.noChao = false;
                this.bufferPulo = 0;
                this.achata = -1;                       // estica ao decolar
            } else if (this.z - chao > 4) {
                this.noChao = false;                    // o chão acabou: cai
                this.vz = 0;
            } else {
                // acompanha o chão (o terreno ondula; degraus pequenos são suavizados)
                this.z += (chao - this.z) * 0.5;
                if (Math.abs(chao - this.z) < 0.05) this.z = chao;
            }
        }
        if (!this.noChao) {
            this.vz = Math.max(-12, this.vz - this.gravidade);
            this.z += this.vz;
            if (this.z < chao) {
                this.z = chao;                          // aterrissou (ou o chão subiu sob ele)
                if (this.vz < 0) {
                    this.achata = Math.min(1, -this.vz / 6); // achata conforme a velocidade da queda
                    this.vz = 0;
                    this.noChao = true;
                }
            }
        }
        this.achata *= 0.8;
    }

    // ================== desenho ==================

    // (sx, sy) = pés do personagem na tela; sinP/cosP = inclinação da câmera
    iniciarGolpe(duracao) {
        this.golpeDur = duracao;
        this.golpeT = duracao;
    }

    // (nx, ny) = direção do golpe, de quem atacou para o personagem
    receberDano(dano, nx, ny) {
        if (this.morto || this.invul > 0) return false;
        this.vida = Math.max(0, this.vida - dano);
        this.invul = 70;
        this.flashDano = 12;
        this.kx = nx * 0.16; this.ky = ny * 0.16;
        if (this.vida <= 0) this.morto = true;
        return true;
    }

    reviver() {
        this.vida = this.vidaMax;
        this.morto = false;
        this.invul = 120;
        this.kx = this.ky = 0;
    }

    desenharEm(sx, sy, sinP, cosP) {
        const g = this.caneta;
        const alto = Math.max(0, this.z - this.chaoZ);       // altura acima do chão
        const k = 1 / (1 + alto * 0.03);                     // a sombra diminui com a altura

        // sombra no chão (fica embaixo mesmo durante o pulo)
        g.save();
        g.fillStyle = `rgba(0,0,0,${0.32 * k})`;
        g.beginPath();
        g.ellipse(sx, sy + alto * cosP, 8 * k * this.escala, Math.max(1.5, 8 * sinP) * k * this.escala, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();

        const ar = this.noChao ? 0 : 1;
        const andando = this.movendo && this.noChao;
        const s = andando ? Math.sin(this.fase) : 0;
        const c = andando ? Math.cos(this.fase) : 0;
        const bob = andando ? Math.abs(c) * 1.3 : 0.35 + Math.sin(this.tempoAnim * 0.07) * 0.35;

        const corOrig = this.cores.camisa;
        if (this.flashDano > 0) this.cores.camisa = "#e5493d";   // fica vermelho ao levar dano

        g.save();
        g.translate(sx, sy);
        if (this.invul > 0 && !this.morto && Math.floor(this.invul / 4) % 2 === 0) g.globalAlpha = 0.5;
        if (this.golpeT > 0 && this.armaTipo && !this.armaTiro) this.arcoGolpe(g);   // corte da arma
        if (this.morto) { g.rotate(this.estado === -2 ? -1.45 : 1.45); g.globalAlpha = 0.8; }
        g.scale(this.escala * (1 + this.achata * 0.14), this.escala * (1 - this.achata * 0.18));
        if (this.estado === -2) g.scale(-1, 1);              // esquerda = direita espelhada

        if (this.estado === -1) this.vistaFrente(g, s, bob, ar, false);
        else if (this.estado === 1) this.vistaFrente(g, s, bob, ar, true);
        else this.vistaLado(g, s, c, bob, ar);
        g.restore();
        this.cores.camisa = corOrig;
    }

    // arco branco que acompanha o golpe de espada/machado
    arcoGolpe(g) {
        const u = 1 - this.golpeT / this.golpeDur;
        const ang = this.estado === 2 ? 0 : this.estado === -2 ? Math.PI : this.estado === 1 ? -Math.PI / 2 : Math.PI / 2;
        g.save();
        g.lineCap = "round";
        for (const [w, a] of [[5, 0.25], [2.4, 0.85]]) {
            g.strokeStyle = `rgba(255,255,255,${a * (1 - u * 0.7)})`;
            g.lineWidth = w;
            g.beginPath();
            g.arc(0, -11, 17, ang - 1.1, ang - 1.1 + 2.2 * Math.min(1, u * 1.6));
            g.stroke();
        }
        g.restore();
    }

    // arma na mão (hx, hy): balança no golpe
    maoArma(g, hx, hy) {
        let ang = this.armaTiro ? 0.15 : 0.5;
        if (this.golpeT > 0) {
            const u = 1 - this.golpeT / this.golpeDur;
            ang = this.armaTiro ? 0.15 - Math.sin(u * Math.PI) * 0.25 : -1.3 + u * 2.9;
        }
        Itens.desenharMao(g, this.armaTipo, hx, hy, ang, 0.85);
    }

    // ---------- formas básicas (com contorno) ----------
    forma(g, cor) {
        g.fillStyle = cor; g.fill();
        g.strokeStyle = this.cores.contorno; g.lineWidth = 0.9; g.lineJoin = "round"; g.stroke();
    }
    circ(g, x, y, r, cor) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); this.forma(g, cor); }
    elip(g, x, y, rx, ry, cor) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); this.forma(g, cor); }
    ret(g, x, y, w, h, r, cor) {
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
        this.forma(g, cor);
    }
    capsula(g, x1, y1, x2, y2, w, cor) {
        g.lineCap = "round";
        g.strokeStyle = this.cores.contorno; g.lineWidth = w + 1.6;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = cor; g.lineWidth = w;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }

    // ---------- de frente / de costas ----------
    vistaFrente(g, s, bob, ar, costas) {
        const C = this.cores;
        const abre = ar * 1.6;                 // pernas abertas no ar
        const encolhe = ar * 2.5;              // e dobradas
        const levE = Math.max(0, s) * 2.4, levD = Math.max(0, -s) * 2.4; // pé levantado ao andar

        // pernas e sapatos
        this.capsula(g, -2.5 - abre, -8.5, -2.5 - abre, -2.4 - levE - encolhe, 3.5, C.calca);
        this.capsula(g, 2.5 + abre, -8.5, 2.5 + abre, -2.4 - levD - encolhe, 3.5, C.calca);
        this.elip(g, -2.5 - abre, -1.6 - levE - encolhe, 2.5, 1.6, C.sapato);
        this.elip(g, 2.5 + abre, -1.6 - levD - encolhe, 2.5, 1.6, C.sapato);

        g.save();
        g.translate(0, -bob);

        // tronco
        this.ret(g, -5, -19.5, 10, 11.5, 3.2, C.camisa);
        this.ret(g, -5, -10.8, 10, 3.2, 1.2, C.calca);
        if (costas) {
            this.ret(g, -4.2, -18.6, 8.4, 9.4, 2.2, C.mochila);
            g.fillStyle = "#8f5a28"; g.fillRect(-4.2, -15.4, 8.4, 1.2);
        }

        // braços: balançam ao andar e sobem ao pular
        const bx = ar ? 8.4 : 6.8;
        const hy = ar ? -25 : -10.8;
        const yE = ar ? hy : hy - s * 2.2, yD = ar ? hy : hy + s * 2.2;
        this.capsula(g, -5.4, -17.6, -bx, yE, 3.1, C.camisa);
        this.capsula(g, 5.4, -17.6, bx, yD, 3.1, C.camisa);
        this.circ(g, -bx, yE, 1.8, C.pele);
        this.circ(g, bx, yD, 1.8, C.pele);
        if (this.armaTipo) this.maoArma(g, bx, yD);

        // cabeça
        if (costas) {
            this.circ(g, 0, -26.9, 7.7, C.cabelo);
            g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1.2;
            g.beginPath(); g.arc(0, -27.5, 4.6, Math.PI * 1.15, Math.PI * 1.7); g.stroke();
        } else {
            this.circ(g, 0, -26.7, 7.2, C.pele);
            g.beginPath(); g.arc(0, -26.7, 7.7, Math.PI * 1.12, Math.PI * 1.88); g.closePath();
            this.forma(g, C.cabelo);
            this.elip(g, -2.7, -25.2, 0.95, 1.3, C.contorno);
            this.elip(g, 2.7, -25.2, 0.95, 1.3, C.contorno);
            g.fillStyle = "rgba(230,110,110,0.45)";
            g.beginPath(); g.arc(-4.5, -23.4, 1.2, 0, Math.PI * 2); g.arc(4.5, -23.4, 1.2, 0, Math.PI * 2); g.fill();
            if (ar) {                                   // boca aberta no pulo
                g.fillStyle = "#7a2b2b";
                g.beginPath(); g.ellipse(0, -22.4, 1.2, 1.5, 0, 0, Math.PI * 2); g.fill();
            } else {
                g.strokeStyle = C.contorno; g.lineWidth = 0.8; g.lineCap = "round";
                g.beginPath(); g.arc(0, -23.6, 1.6, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
            }
        }
        g.restore();
    }

    // ---------- de lado (desenhado virado para a direita) ----------
    vistaLado(g, s, c, bob, ar) {
        const C = this.cores;

        // pés: A é a perna da frente quando s > 0
        const pA = ar ? [3.4, -5.6] : [s * 3.6, -2.3 - Math.max(0, c) * 2.2];
        const pB = ar ? [-3.4, -3.4] : [-s * 3.6, -2.3 - Math.max(0, -c) * 2.2];

        // perna de trás
        this.capsula(g, -0.3, -8.5, pB[0], pB[1], 3.5, C.calcaEscura);
        this.elip(g, pB[0] + 0.8, pB[1] + 0.8, 2.7, 1.6, C.sapato);

        g.save();
        g.translate(0, -bob);

        // braço de trás
        const hB = ar ? [-4, -23.5] : [s * 3.6, -10.8];
        this.capsula(g, 0, -17.6, hB[0], hB[1], 3, C.camisaEscura);
        this.circ(g, hB[0], hB[1], 1.8, C.pele);

        // mochila e tronco
        this.ret(g, -6.9, -18.6, 4, 9, 1.8, C.mochila);
        this.ret(g, -3.8, -19.5, 7.6, 11.5, 3.2, C.camisa);
        this.ret(g, -3.8, -10.8, 7.6, 3.2, 1.2, C.calca);
        g.restore();

        // perna da frente
        this.capsula(g, 0.3, -8.5, pA[0], pA[1], 3.5, C.calca);
        this.elip(g, pA[0] + 0.8, pA[1] + 0.8, 2.7, 1.6, C.sapato);

        g.save();
        g.translate(0, -bob);

        // cabeça: cabelo cobre o topo e a parte de trás
        this.circ(g, 0.8, -26.7, 7.2, C.pele);
        g.beginPath();
        g.arc(0.8, -26.7, 7.7, Math.PI * 0.88, Math.PI * 1.82);   // topo e parte de trás
        g.quadraticCurveTo(4.6, -27.4, -1.2, -25.4);              // franja caindo da testa
        g.closePath();
        this.forma(g, C.cabelo);
        this.elip(g, 4.3, -25.6, 0.95, 1.3, C.contorno);
        g.fillStyle = "rgba(230,110,110,0.45)";
        g.beginPath(); g.arc(5.2, -23.3, 1.2, 0, Math.PI * 2); g.fill();
        g.strokeStyle = C.contorno; g.lineWidth = 0.8; g.lineCap = "round";
        if (ar) { g.beginPath(); g.arc(5.8, -22.6, 1.0, 0, Math.PI * 2); g.stroke(); }
        else { g.beginPath(); g.moveTo(5.0, -22.6); g.lineTo(6.6, -22.9); g.stroke(); }

        // braço da frente
        const hA = ar ? [5.6, -24.2] : [-s * 3.6, -10.8];
        this.capsula(g, 0.4, -17.6, hA[0], hA[1], 3, C.camisa);
        this.circ(g, hA[0], hA[1], 1.8, C.pele);
        if (this.armaTipo) this.maoArma(g, hA[0], hA[1]);
        g.restore();
    }
}

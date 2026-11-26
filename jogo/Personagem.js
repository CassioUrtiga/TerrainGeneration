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

        // Pulo e Nado
        this.gravidade = 0.35;    // queda por frame
        this.forcaPulo = 5.2;     // impulso inicial
        this.vz = 0;
        this.noChao = true;
        this.naAgua = false;      // true quando está nadando na água
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

        // Destino do mouse: { gx, gy } ou null
        this.destino = null;
        this.semProgresso = 0;

        // Animação
        this.estado = -1;         // 1 costas | -1 frente | 2 direita | -2 esquerda
        this.movendo = false;
        this.fase = 0;            // fase do ciclo de caminhada/nado
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
    // A pegada toca no máximo 2 linhas x 2 colunas de tiles; nada é alocado aqui.
    livre(terreno, gx, gy) {
        const r = this.raio;
        const i0 = Math.round(gx - r), i1 = Math.round(gx + r);
        const j0 = Math.round(gy - r), j1 = Math.round(gy + r);
        // tiles da pegada atual (se já está sobre um obstáculo, pode sair dele)
        const ci0 = Math.round(this.gx - r), ci1 = Math.round(this.gx + r);
        const cj0 = Math.round(this.gy - r), cj1 = Math.round(this.gy + r);
        const temObs = terreno.temObstaculo;

        for (let a = 0; a < 2; a++) {
            const i = a === 0 ? i0 : i1;
            if (a === 1 && i1 === i0) break;
            for (let b = 0; b < 2; b++) {
                const j = b === 0 ? j0 : j1;
                if (b === 1 && j1 === j0) break;
                if (terreno.alturaTile(i, j) - this.z > this.passoMax) return false;
                if (temObs && terreno.temObstaculo(i, j) &&
                    !((i === ci0 || i === ci1) && (j === cj0 || j === cj1))) return false;
            }
        }
        return true;
    }

    alturaChao(terreno, gx, gy) {
        const r = this.raio;
        const i0 = Math.round(gx - r), i1 = Math.round(gx + r);
        const j0 = Math.round(gy - r), j1 = Math.round(gy + r);
        let m = terreno.alturaTile(i0, j0);
        if (j1 !== j0) { const h = terreno.alturaTile(i0, j1); if (h > m) m = h; }
        if (i1 !== i0) {
            let h = terreno.alturaTile(i1, j0); if (h > m) m = h;
            if (j1 !== j0) { h = terreno.alturaTile(i1, j1); if (h > m) m = h; }
        }
        return m;
    }

    // Verifica se o bioma atual tem água no nível 0 (exclui vulcões e dunas)
    biomaTemAgua(terreno) {
        if (typeof Algoritmo === "undefined" || !Algoritmo.tipos) return true;
        const tipoInfo = Algoritmo.tipos[terreno.algoritmoTerreno];
        if (!tipoInfo) return true;
        return tipoInfo.paleta !== "vulcao" && tipoInfo.paleta !== "dunas";
    }

    // Movimento, colisão, nado e pulo. Chamado pelo terreno a cada frame, com a câmera atual (yaw).
    atualizar(terreno, yaw) {
        if (this.gx === null) this.posicionarInicio(terreno);
        this.tempoAnim++;

        const t = this.morto ? {} : this.teclado;
        if (this.invul > 0) this.invul--;
        if (this.flashDano > 0) this.flashDano--;
        if (this.golpeT > 0) this.golpeT--;

        const chao = this.alturaChao(terreno, this.gx, this.gy);
        this.chaoZ = chao;

        // Está na água se o chão estiver no nível 0, encostado na superfície e o bioma tiver água
        this.naAgua = this.noChao && chao <= 0.1 && this.biomaTemAgua(terreno);

        // Nadar é ligeiramente mais lento que correr em terra firme
        const velAtual = this.naAgua ? this.velocidade * 0.72 : this.velocidade;

        const ex = (t.direita ? 1 : 0) - (t.esquerda ? 1 : 0); // direção na TELA
        const ey = (t.baixo ? 1 : 0) - (t.cima ? 1 : 0);
        const c = Math.cos(yaw), s = Math.sin(yaw);
        let dx = 0, dy = 0;     // passo no chão neste frame

        if (ex !== 0 || ey !== 0) {
            this.destino = null;                      // o teclado cancela o destino do mouse
            if (ex !== 0) this.estado = ex > 0 ? 2 : -2;
            else this.estado = ey > 0 ? -1 : 1;

            // direção da tela -> direção no chão (compensa a rotação da câmera)
            const len = Math.hypot(ex, ey);
            const vx = ex / len, vy = ey / len;
            dx = (vx * c + vy * s) * velAtual;
            dy = (-vx * s + vy * c) * velAtual;
        } else if (this.destino && !this.morto) {
            // mouse: caminha/nada em linha reta até o ponto clicado
            const ddx = this.destino.gx - this.gx, ddy = this.destino.gy - this.gy;
            const dist = Math.hypot(ddx, ddy);
            if (dist < 0.1) {
                this.destino = null;                  // chegou
            } else {
                const passo = Math.min(velAtual, dist);
                dx = ddx / dist * passo;
                dy = ddy / dist * passo;
                const sxs = ddx * c - ddy * s, sys = ddx * s + ddy * c;   // direção na tela
                this.estado = Math.abs(sxs) >= Math.abs(sys) ? (sxs > 0 ? 2 : -2) : (sys > 0 ? -1 : 1);
            }
        } else {
            this.destino = null;
        }
        this.movendo = dx !== 0 || dy !== 0;

        if (this.movendo) {
            const x0 = this.gx, y0 = this.gy;
            // eixos separados: permite deslizar ao longo de paredes
            if (this.livre(terreno, this.gx + dx, this.gy)) this.gx += dx;
            if (this.livre(terreno, this.gx, this.gy + dy)) this.gy += dy;

            // preso (obstáculo, parede, degrau alto demais): desiste do destino
            if (this.destino) {
                const andou = Math.hypot(this.gx - x0, this.gy - y0);
                this.semProgresso = andou < 0.3 * Math.hypot(dx, dy) ? this.semProgresso + 1 : 0;
                if (this.semProgresso > 25) { this.destino = null; this.semProgresso = 0; }
            } else this.semProgresso = 0;
        }

        if (this.naAgua) {
            // Ciclo contínuo de braçadas (mais rápido quando está nadando ativamente)
            this.fase += this.movendo ? 0.22 : 0.08;
        } else if (this.movendo && this.noChao) {
            this.fase += 0.3;
        }

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

        if (this.noChao) {
            if (this.bufferPulo > 0) {
                // Impulso para sair da água ou pular no chão
                this.vz = this.naAgua ? this.forcaPulo * 0.88 : this.forcaPulo;
                this.noChao = false;
                this.naAgua = false;
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
                this.z = chao;                          // aterrissou ou caiu na água
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

    iniciarGolpe(duracao) {
        this.golpeDur = duracao;
        this.golpeT = duracao;
    }

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

        // Se estiver na água, renderiza a animação exclusiva de nado
        if (this.naAgua) {
            this.desenharNadando(g, sx, sy, sinP);
            return;
        }

        const alto = Math.max(0, this.z - this.chaoZ);       // altura acima do chão
        const k = 1 / (1 + alto * 0.03);                     // a sombra diminui com a altura

        // sombra no chão (fica embaixo mesmo durante o pulo)
        g.fillStyle = `rgba(0,0,0,${0.32 * k})`;
        g.beginPath();
        g.ellipse(sx, sy + alto * cosP, 8 * k * this.escala, Math.max(1.5, 8 * sinP) * k * this.escala, 0, 0, Math.PI * 2);
        g.fill();

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

    // ================== animação de nadar ==================

    desenharNadando(g, sx, sy, sinP) {
        const esc = this.escala;
        const t = this.tempoAnim;
        const f = this.fase;
        const s = Math.sin(f);
        const c = Math.cos(f);
        const flutua = Math.sin(t * 0.1) * 1.1; // oscilação vertical na superfície

        // 1) Ondas concêntricas e espuma na superfície da água
        g.save();
        g.translate(sx, sy);
        g.scale(esc, esc);

        const cicloOnda = (t * 0.035) % 1;
        const raioOnda = 7 + cicloOnda * (this.movendo ? 13 : 8);
        g.strokeStyle = `rgba(255, 255, 255, ${(1 - cicloOnda) * 0.55})`;
        g.lineWidth = 1.4;
        g.beginPath();
        g.ellipse(0, 0, raioOnda, Math.max(2.5, raioOnda * sinP), 0, 0, Math.PI * 2);
        g.stroke();

        // Segunda onda defasada e rastro de espuma quando está nadando
        const ciclo2 = (cicloOnda + 0.5) % 1;
        const raio2 = 6 + ciclo2 * (this.movendo ? 11 : 6);
        g.strokeStyle = `rgba(210, 245, 255, ${(1 - ciclo2) * 0.45})`;
        g.lineWidth = 1.1;
        g.beginPath();
        g.ellipse(0, 0, raio2, Math.max(2, raio2 * sinP), 0, 0, Math.PI * 2);
        g.stroke();

        if (this.movendo) {
            // Rastro atrás do nadador
            const rastroX = this.estado === 2 ? -10 : this.estado === -2 ? 10 : 0;
            const rastroY = this.estado === -1 ? -6 : this.estado === 1 ? 6 : 0;
            g.fillStyle = "rgba(255, 255, 255, 0.35)";
            g.beginPath();
            g.ellipse(rastroX, rastroY, 5 + Math.abs(s) * 2, Math.max(2, 4 * sinP), 0, 0, Math.PI * 2);
            g.fill();
        }
        g.restore();

        // 2) Corpo submerso (recorta tudo abaixo da linha d'água y = 1.5)
        const corOrig = this.cores.camisa;
        if (this.flashDano > 0) this.cores.camisa = "#e5493d";

        g.save();
        g.translate(sx, sy);
        if (this.invul > 0 && !this.morto && Math.floor(this.invul / 4) % 2 === 0) g.globalAlpha = 0.5;
        if (this.golpeT > 0 && this.armaTipo && !this.armaTiro) this.arcoGolpe(g);
        g.scale(esc, esc);
        if (this.estado === -2) g.scale(-1, 1);

        // Clip da linha d'água: esconde pernas/quadril que ficam dentro da água
        g.save();
        g.beginPath();
        g.rect(-36, -48, 72, 49.5);
        g.clip();

        if (this.morto) {
            g.rotate(1.45);
            g.globalAlpha = 0.8;
            this.vistaLado(g, 0, 0, 0, 0);
        } else if (this.estado === -1) {
            this.nadarFrenteCostas(g, s, c, flutua, false);
        } else if (this.estado === 1) {
            this.nadarFrenteCostas(g, s, c, flutua, true);
        } else {
            this.nadarLado(g, s, c, flutua);
        }
        g.restore();

        // Linha brilhante de espuma cortando o tronco na água
        g.strokeStyle = "rgba(235, 250, 255, 0.85)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(-8.5, 1.2);
        g.quadraticCurveTo(0, 2.2, 8.5, 1.2);
        g.stroke();

        g.restore();
        this.cores.camisa = corOrig;
    }

    // Nado de frente ou de costas: tronco parcialmente submerso e braçadas alternadas
    nadarFrenteCostas(g, s, c, flutua, costas) {
        const C = this.cores;
        const submersoY = 10.5 - flutua; // desloca o corpo para baixo (cintura dentro d'água)

        g.save();
        g.translate(0, submersoY);
        // Balanço lateral dos ombros durante as braçadas
        g.rotate(this.movendo ? s * 0.09 : s * 0.02);

        // Tronco (parte inferior será cortada pelo clip da água)
        this.ret(g, -5.2, -19.5, 10.4, 13, 3.2, C.camisa);
        if (costas) {
            this.ret(g, -4.2, -18.6, 8.4, 9.4, 2.2, C.mochila);
            g.fillStyle = "#8f5a28"; g.fillRect(-4.2, -15.4, 8.4, 1.2);
        }

        // Braços alternando braçadas sobre a superfície da água
        const ampBraco = this.movendo ? 4.2 : 1.5;
        const bxE = -7.6 - Math.max(0, s) * 1.4;
        const bxD =  7.6 + Math.max(0, -s) * 1.4;
        const yE = -12.5 - s * ampBraco;
        const yD = -12.5 + s * ampBraco;

        this.capsula(g, -5.4, -17.6, bxE, yE, 3.1, C.camisa);
        this.capsula(g,  5.4, -17.6, bxD, yD, 3.1, C.camisa);
        this.circ(g, bxE, yE, 1.8, C.pele);
        this.circ(g, bxD, yD, 1.8, C.pele);
        if (this.armaTipo) this.maoArma(g, bxD, yD);

        // Cabeça erguida acima da água
        if (costas) {
            this.circ(g, 0, -26.5, 7.7, C.cabelo);
            g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1.2;
            g.beginPath(); g.arc(0, -27.1, 4.6, Math.PI * 1.15, Math.PI * 1.7); g.stroke();
        } else {
            this.circ(g, 0, -26.3, 7.2, C.pele);
            g.beginPath(); g.arc(0, -26.3, 7.7, Math.PI * 1.12, Math.PI * 1.88); g.closePath();
            this.forma(g, C.cabelo);
            this.elip(g, -2.7, -24.8, 0.95, 1.3, C.contorno);
            this.elip(g,  2.7, -24.8, 0.95, 1.3, C.contorno);
            g.fillStyle = "rgba(230,110,110,0.45)";
            g.beginPath(); g.arc(-4.5, -23.0, 1.2, 0, Math.PI * 2); g.arc(4.5, -23.0, 1.2, 0, Math.PI * 2); g.fill();
            // Boca respirando/sorrindo fora d'água
            g.strokeStyle = C.contorno; g.lineWidth = 0.85; g.lineCap = "round";
            g.beginPath(); g.arc(0, -23.2, 1.6, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
        }

        g.restore();
    }

    // Nado lateral: corpo inclinado horizontalmente na água com braçadas circulares
    nadarLado(g, s, c, flutua) {
        const C = this.cores;
        const submersoY = 8.5 - flutua;

        g.save();
        g.translate(0, submersoY);

        // Corpo inclinado para frente enquanto nada (ou mais vertical boiando parado)
        const inclinacao = this.movendo ? 0.58 : 0.16;
        g.save();
        g.rotate(inclinacao);

        // Braço de trás fazendo ciclo circular
        const raioBraco = this.movendo ? 5.2 : 2.0;
        const hBx = -c * raioBraco;
        const hBy = -14.5 + s * (raioBraco * 0.65);
        this.capsula(g, 0, -17.6, hBx, hBy, 3, C.camisaEscura);
        this.circ(g, hBx, hBy, 1.8, C.pele);

        // Mochila e tronco submersos na diagonal
        this.ret(g, -6.9, -18.6, 4, 9, 1.8, C.mochila);
        this.ret(g, -3.8, -19.5, 7.6, 12.5, 3.2, C.camisa);

        // Braço da frente em fase oposta (crawl)
        const hAx = c * raioBraco;
        const hAy = -14.5 - s * (raioBraco * 0.65);
        this.capsula(g, 0.4, -17.6, hAx, hAy, 3, C.camisa);
        this.circ(g, hAx, hAy, 1.8, C.pele);
        if (this.armaTipo) this.maoArma(g, hAx, hAy);
        g.restore();

        // Cabeça compensa a inclinação do tronco para manter rosto e olhos fora d'água
        const cabX = this.movendo ? 8.2 : 2.5;
        const cabY = this.movendo ? -21.5 : -25.8;
        g.save();
        g.translate(cabX, cabY);
        this.circ(g, 0.8, 0, 7.2, C.pele);
        g.beginPath();
        g.arc(0.8, 0, 7.7, Math.PI * 0.88, Math.PI * 1.82);
        g.quadraticCurveTo(4.6, -0.7, -1.2, 1.3);
        g.closePath();
        this.forma(g, C.cabelo);
        this.elip(g, 4.3, 1.1, 0.95, 1.3, C.contorno);
        g.fillStyle = "rgba(230,110,110,0.45)";
        g.beginPath(); g.arc(5.2, 3.4, 1.2, 0, Math.PI * 2); g.fill();
        g.strokeStyle = C.contorno; g.lineWidth = 0.8; g.lineCap = "round";
        g.beginPath(); g.moveTo(5.0, 4.1); g.lineTo(6.6, 3.8); g.stroke();
        g.restore();

        g.restore();
    }

    // arco branco que acompanha o golpe de espada/machado
    arcoGolpe(g) {
        const u = 1 - this.golpeT / this.golpeDur;
        const ang = this.estado === 2 ? 0 : this.estado === -2 ? Math.PI : this.estado === 1 ? -Math.PI / 2 : Math.PI / 2;
        g.save();
        g.lineCap = "round";
        for (let q = 0; q < 2; q++) {
            const w = q === 0 ? 5 : 2.4, a = q === 0 ? 0.25 : 0.85;
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
        const pAx = ar ? 3.4 : s * 3.6, pAy = ar ? -5.6 : -2.3 - Math.max(0, c) * 2.2;
        const pBx = ar ? -3.4 : -s * 3.6, pBy = ar ? -3.4 : -2.3 - Math.max(0, -c) * 2.2;

        // perna de trás
        this.capsula(g, -0.3, -8.5, pBx, pBy, 3.5, C.calcaEscura);
        this.elip(g, pBx + 0.8, pBy + 0.8, 2.7, 1.6, C.sapato);

        g.save();
        g.translate(0, -bob);

        // braço de trás
        const hBx = ar ? -4 : s * 3.6, hBy = ar ? -23.5 : -10.8;
        this.capsula(g, 0, -17.6, hBx, hBy, 3, C.camisaEscura);
        this.circ(g, hBx, hBy, 1.8, C.pele);

        // mochila e tronco
        this.ret(g, -6.9, -18.6, 4, 9, 1.8, C.mochila);
        this.ret(g, -3.8, -19.5, 7.6, 11.5, 3.2, C.camisa);
        this.ret(g, -3.8, -10.8, 7.6, 3.2, 1.2, C.calca);
        g.restore();

        // perna da frente
        this.capsula(g, 0.3, -8.5, pAx, pAy, 3.5, C.calca);
        this.elip(g, pAx + 0.8, pAy + 0.8, 2.7, 1.6, C.sapato);

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
        const hAx = ar ? 5.6 : -s * 3.6, hAy = ar ? -24.2 : -10.8;
        this.capsula(g, 0.4, -17.6, hAx, hAy, 3, C.camisa);
        this.circ(g, hAx, hAy, 1.8, C.pele);
        if (this.armaTipo) this.maoArma(g, hAx, hAy);
        g.restore();
    }
}

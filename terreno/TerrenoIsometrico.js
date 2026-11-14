class TerrenoIsometrico {
    constructor(caneta, linhas, colunas) {
        this.algoritmo = new Algoritmo();

        this.caneta = caneta;
        this.linhas = linhas;
        this.colunas = colunas;

        // Parâmetros de ajuste do terreno
        this.amplitude = 40;
        this.frequencia = 0.15;
        this.algoritmoTerreno = 0;
        this.velocidade = 0.03;

        // Câmera 3D (os valores iniciais reproduzem a vista isométrica original)
        this.yaw = Math.PI / 4;                    // giro horizontal (rad)
        this.pitch = Math.atan(1 / Math.SQRT2);    // inclinação vertical (~35,26°)
        this.pitchMin = 0.12;                      // quase de lado
        this.pitchMax = 1.5;                       // quase de cima

        // Geometria
        this.tamanhoTile = 23.57;  // lado do tile no mundo (px)
        this.escalaAltura = 1.2;   // multiplicador da altura das colunas
        this.corLado = "rgb(120, 90, 60)";

        this.tempo = 0;
    }

    // dYaw / dPitch em radianos
    rotacionar(dYaw, dPitch) {
        this.yaw = (this.yaw + dYaw) % (Math.PI * 2);
        this.pitch = Math.max(this.pitchMin, Math.min(this.pitchMax, this.pitch + dPitch));
    }

    resetarVista() {
        this.yaw = Math.PI / 4;
        this.pitch = Math.atan(1 / Math.SQRT2);
    }

    poligono(pontos, cor) {
        const ctx = this.caneta;
        ctx.beginPath();
        ctx.moveTo(pontos[0][0], pontos[0][1]);
        for (let k = 1; k < pontos.length; k++) ctx.lineTo(pontos[k][0], pontos[k][1]);
        ctx.closePath();
        ctx.fillStyle = cor;
        ctx.fill();
        // contorno da mesma cor para esconder frestas entre polígonos
        ctx.strokeStyle = cor;
        ctx.lineWidth = 0.6;
        ctx.stroke();
    }

    desenhar() {
        const ctx = this.caneta;
        const largura = ctx.canvas.width;
        const alturaTela = ctx.canvas.height;
        ctx.clearRect(0, 0, largura, alturaTela);

        const cx = largura / 2;
        const cy = alturaTela / 2 + 40;
        const cosA = Math.cos(this.yaw), sinA = Math.sin(this.yaw);
        const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
        const s = this.tamanhoTile;
        const meio = s / 2;

        // mundo (x, y, z) -> tela [sx, sy]
        const proj = (x, y, z) => [
            cx + x * cosA - y * sinA,
            cy + (x * sinA + y * cosA) * sinP - z * cosP,
        ];

        // 1) calcula alturas e profundidade de cada tile
        const tiles = [];
        for (let i = 0; i < this.linhas; i++) {
            for (let j = 0; j < this.colunas; j++) {
                const wx = (i - (this.linhas - 1) / 2) * s;
                const wy = (j - (this.colunas - 1) / 2) * s;
                const h = Math.max(0, this.algoritmo.algoritmo(
                    i, j, this.algoritmoTerreno, this.frequencia, this.tempo, this.amplitude
                ));
                tiles.push({ wx, wy, h, prof: wx * sinA + wy * cosA });
            }
        }

        // 2) algoritmo do pintor: do mais distante para o mais próximo
        tiles.sort((a, b) => a.prof - b.prof);

        const cantos = [[-meio, -meio], [meio, -meio], [meio, meio], [-meio, meio]];
        const normais = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // normal da aresta k -> k+1

        // 3) desenha
        for (const t of tiles) {
            const z = t.h * this.escalaAltura;
            const topo = cantos.map(([dx, dy]) => proj(t.wx + dx, t.wy + dy, z));

            if (z > 0.5) {
                const base = cantos.map(([dx, dy]) => proj(t.wx + dx, t.wy + dy, 0));
                for (let k = 0; k < 4; k++) {
                    const [nx, ny] = normais[k];
                    const n1y = nx * sinA + ny * cosA;
                    if (n1y <= 0) continue; // face de costas para a câmera

                    const n1x = nx * cosA - ny * sinA;
                    const fator = Math.max(0, Math.min(0.4, 0.12 + 0.13 * n1x));
                    const k2 = (k + 1) % 4;
                    this.poligono(
                        [topo[k], topo[k2], base[k2], base[k]],
                        this.escurecer(this.corLado, fator)
                    );
                }
            }

            this.poligono(topo, this.alturaCor(t.h));
        }

        this.tempo += this.velocidade;
    }

    alturaCor(altura) {
        const verde = Math.max(0, Math.min(255, 100 + altura * 3));
        const r = Math.max(0, Math.min(255, 50 + altura * 0.5));
        return `rgb(${Math.floor(r)},${Math.floor(verde)},50)`;
    }

    escurecer(cor, fator) {
        const rgb = cor.match(/\d+/g).map(Number);
        return `rgb(${Math.floor(rgb[0] * (1 - fator))}, ${Math.floor(rgb[1] * (1 - fator))}, ${Math.floor(rgb[2] * (1 - fator))})`;
    }

    set setAmplitude(valor) { this.amplitude = valor; }
    set setFrequencia(valor) { this.frequencia = valor; }
    set setAlgoritmoTerreno(valor) { this.algoritmoTerreno = valor; }
    set setVelocidade(valor) { this.velocidade = valor; }
}

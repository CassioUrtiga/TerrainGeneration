class Algoritmo {
    constructor() {}

    algoritmo(i, j, tipo, frequencia, tempo, amplitude) {
        switch (tipo) {
            case 0:
                return (Math.sin(i * frequencia + tempo) +
                        Math.cos(j * frequencia + tempo / 2)) * amplitude / 2;
            case 1:
                return (
                    Math.abs(Math.sin(i * frequencia + tempo) +
                    Math.cos(j * frequencia + tempo)) * amplitude
                );
            case 2:
                return (
                    Math.sin(i * frequencia + tempo) *
                    Math.cos(j * frequencia + tempo) * amplitude
                );
            case 3:
                return (
                    (Math.sin(i * frequencia + tempo) +
                    Math.abs(Math.cos(j * frequencia - tempo * 0.7))) *
                    amplitude / 1.5
                );
            case 4:
                return (
                    (Math.sin(i * 0.3 + tempo) +
                    Math.cos(j * 0.4 + tempo * 0.7) +
                    Math.sin((i + j) * 0.2 + tempo * 1.3)) *
                    amplitude / 2.5
                );
            case 5:
                let valor = 0;
                for (let k = 1; k < 4; k++) {
                    valor += Math.sin((i + j) * frequencia * k + tempo * 0.5 * k) / k;
                }
                return valor * amplitude;
            case 6:
                const r = Math.sqrt(i * i + j * j);
                return Math.sin(r * frequencia - tempo) * amplitude;
            case 7:
                const ang = Math.atan2(j - 15, i - 15);
                const dist = Math.sqrt((i - 15)**2 + (j - 15)**2);
                return Math.sin(dist * frequencia - tempo + ang * 3) * amplitude;
            default:
                return 0;
        }
    }

}
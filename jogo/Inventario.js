class Inventario {
    constructor() {
        this.slots = [null, null, null];
        this.sel = 0;
    }

    atual() { return this.slots[this.sel]; }

    selecionar(i) {
        if (i >= 0 && i < this.slots.length) this.sel = i;
    }

    // guarda no slot selecionado (se vazio) ou no primeiro vazio. Retorna o slot, ou -1 se cheio
    pegar(tipo) {
        let idx = !this.slots[this.sel] ? this.sel : this.slots.findIndex((s) => !s);
        if (idx < 0) return -1;
        this.slots[idx] = { tipo };
        return idx;
    }

    // tira o item do slot selecionado e o devolve
    retirar() {
        const it = this.slots[this.sel];
        this.slots[this.sel] = null;
        return it;
    }
}

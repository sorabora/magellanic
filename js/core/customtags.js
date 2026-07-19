class OtterLoader extends HTMLElement {
  constructor() {
    super();
    this.innerHTML = `
        <div class="loader">
            <div class="ring"></div>
        </div>
    `;
  }
}

customElements.define("otter-loader", OtterLoader);
const content = createWindow("calculator", "Calculator", {
  closable: true,
  minimizable: true,
  resizable: false,
});

content.innerHTML = `
      <input id="calcInput" maxlength="16" type="text">
      <hr>
      <div class="grid-4x4">
        <button class="light" data-val="7">7</button>
        <button class="light" data-val="8">8</button>
        <button class="light" data-val="9">9</button>
        <button data-val="+">+</button>
    
        <button class="light" data-val="4">4</button>
        <button class="light" data-val="5">5</button>
        <button class="light" data-val="6">6</button>
        <button data-val="-">-</button>
    
        <button class="light" data-val="1">1</button>
        <button class="light" data-val="2">2</button>
        <button class="light" data-val="3">3</button>
        <button data-val="x">x</button>
    
        <button class="light" data-val="0">0</button>
        <button class="light" data-val=".">.</button>
        <button class="dark" data-val="=">=</button>
        <button class="dark" data-val="/">/</button>
        </div>
    `;

const calcInput = content.querySelector("#calcInput");

function safeCalculate(expr) {
  let pos = 0;

  function peek() {
    return expr[pos];
  }

  function consume(ch) {
    if (ch !== undefined && expr[pos] !== ch) {
      throw new Error("invalid");
    }
    return expr[pos++];
  }

  function parseNumber() {
    const start = pos;
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) {
      pos++;
    }
    if (start === pos) {
      throw new Error("invalid");
    }
    return parseFloat(expr.slice(start, pos));
  }

  function parseFactor() {
    if (peek() === "(") {
      consume("(");
      const value = parseExpression();
      consume(")");
      return value;
    }
    if (peek() === "-") {
      consume("-");
      return -parseFactor();
    }
    if (peek() === "+") {
      consume("+");
      return parseFactor();
    }
    return parseNumber();
  }

  function parseTerm() {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const right = parseFactor();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }

  function parseExpression() {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseTerm();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  const result = parseExpression();
  if (pos < expr.length) {
    throw new Error("invalid");
  }
  return result;
}

content.querySelectorAll("[data-val]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.val != "=") {
      calcInput.value += button.dataset.val;
    } else {
      const clean = calcInput.value.replaceAll("x", "*").replace(/\s/g, "");
      if (!/^[0-9+\-*/().]+$/.test(clean)) {
        calcInput.value = "invalid";
        return;
      }
      try {
        calcInput.value = String(safeCalculate(clean));
      } catch {
        calcInput.value = "invalid";
      }
    }
  });
});

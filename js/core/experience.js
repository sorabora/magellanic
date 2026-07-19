let page = 0;
let selectedTheme = null;

function setExPrompt(theader, tcontent, tactions) {
  const header = "exPromptHeader";
  const content = "exPromptContent";
  const actions = "exPromptActions";

  document.getElementById(header).innerHTML = theader;
  document.getElementById(content).innerHTML = tcontent;
  document.getElementById(actions).innerHTML = tactions;
}

function updatePage() {
  switch (page) {
    case -10: {
      setExPrompt(
        `Login`,
        `
        <p>Login to your <span class="important">tint</span> account</p>
        <label for="loginInput">Username</label>
        <input id="loginInput" type="text">
      
        <label for="passwordInput">Password</label>
        <input id="passwordInput" type="password">
        `,
        `
        <button id="backBtn" class="f-1">Back</button>
        <button id="authBtn" class="f-1 auto">Login</button>
        `
      );
      const backBtn = document.getElementById("backBtn");
      backBtn.addEventListener("click", () => {
        page = 0;
        updatePage();
      });

      const authBtn = document.getElementById("authBtn");
      authBtn.addEventListener("click", async () => {
        const usernameValue = document
          .getElementById("loginInput")
          .value.trim();
        const passwordValue = document.getElementById("passwordInput").value;
        if (!usernameValue || !passwordValue) {
          console.log("Missing username or password");
          return;
        }
        const email = `${usernameValue.toLowerCase()}@cubchat.com`;

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password: passwordValue,
        });
        if (error) {
          console.error("Login failed:", error.message);
          return;
        }
        console.log("Logged in:", data.user);
        username = usernameValue;
        page = 0;
        updatePage();
      });
      break;
    }
    case -9: {
      setExPrompt(
        `Signup`,
        `
        <p>Create your <span class="important">tint</span> account</p>
        <label for="loginInput">Username</label>
        <input id="loginInput" type="text">
      
        <label for="passwordInput">Password</label>
        <input id="passwordInput" type="password">
        `,
        `
        <button id="backBtn" class="f-1">Back</button>
        <button id="authBtn" class="f-1 auto">Signup</button>
        `
      );

      const backBtn = document.getElementById("backBtn");
      backBtn.addEventListener("click", () => {
        page = 1;
        updatePage();
      });

      const authBtn = document.getElementById("authBtn");

      authBtn.addEventListener("click", async () => {
        const usernameValue = document
          .getElementById("loginInput")
          .value.trim();

        const passwordValue = document.getElementById("passwordInput").value;
        if (!usernameValue || !passwordValue) {
          console.log("Missing username or password");
          return;
        }
        const email = `${usernameValue.toLowerCase()}@cubchat.com`;

        const res = await window.supabase.auth.signUp({
          email,
          password: passwordValue,
        });

        if (res.error) {
          console.error("Signup failed:", res.error.message);
          return;
        }

        if (!res.data?.user) {
          console.error("Signup failed: no user returned");
          return;
        }

        const { error: insertError } = await window.supabase
          .from("users")
          .insert({
            uuid: res.data.user.id,
            username: usernameValue,
          });

        if (insertError) {
          console.error("User row insert failed:", insertError.message);
          return;
        }

        console.log("Signed up:", res.data.user);
        username = usernameValue;
        page = 1;
        updatePage();
      });

      break;
    }
    case 0: {
      setExPrompt(
        `Welcome to <span class="important">magellanic!</span>`,
        `
        <p>Create an account to begin.</p>
        `,
        `
        <button id="skipBtn" class="f-1">Skip</button>
        <button id="loginBtn" class="f-1">Login</button>
        <button id="signupBtn" class="f-1">Signup</button>
        `
      );
      document.getElementById("skipBtn").addEventListener("click", () => {
        page = 1;
        updatePage();
      });

      document.getElementById("loginBtn").addEventListener("click", () => {
        page = -10;
        updatePage();
      });

      document.getElementById("signupBtn").addEventListener("click", () => {
        page = -9;
        updatePage();
      });
      break;
    }
    case 1: {
      setExPrompt(
        "Choose your preferences",
        `
        <p>Display Theme</p>
        <div class="flex-row">
          <button class="f-1 light theme-option" data-theme="light">
            <i class="fa-solid fa-sun"></i>  
            Light
          </button>
          <button class="f-1 dark theme-option" data-theme="dark">
            <i class="fa-solid fa-moon"></i>  
            Dark
          </button>
          <button class="f-1 auto theme-option" data-theme="auto">
            <i class="fa-solid fa-bolt"></i>    
            Auto
          </button>
        </div>
        `,
        `
        <button id="backBtn" class="f-1">Back</button>
        <button id="nextBtn" class="f-1">Next</button>
        `
      );
      const nextBtn = document.getElementById("nextBtn");
      document.querySelectorAll(".theme-option").forEach((button) => {
        button.addEventListener("click", () => {
          selectedTheme = button.dataset.theme;
          document
            .querySelectorAll(".theme-option")
            .forEach((btn) => btn.classList.remove("selected"));
          button.classList.add("selected");
        });
      });
      nextBtn.addEventListener("click", () => {
        if (page == 1) {
          if (!selectedTheme) {
            alert("You must select a theme first!");
            return;
          }
          registry.set("system.theme", selectedTheme);
          page = 2;
          updatePage();
        } else {
          if (!selectedTheme) return;
          page = 2;
          updatePage();
        }
      });
      const backBtn = document.getElementById("backBtn");
      backBtn.addEventListener("click", () => {
        page = 0;
        updatePage();
      });
      break;
    }
    case 2: {
      setExPrompt(
        "Done",
        `
        <p>Setup complete.</p>
        `,
        `
        <button id="backBtn" class="f-1">Back</button>
        <button id="finishBtn" class="f-1">Finish</button>
        `
      );
      const backBtn = document.getElementById("backBtn");
      const finishBtn = document.getElementById("finishBtn");

      backBtn.addEventListener("click", () => {
        page = 1;
        updatePage();
      });

      finishBtn.addEventListener("click", () => {
        page = 3;
        updatePage();
      });
      break;
    }
    case 3: {
      setExPrompt(
        "Installing magellanic!",
        `
        <p>Sit tight while magellanic finishes installing.</p>
        `,
        `
        <progress id="installationProgress" value="0" max="100"> 70% </progress>
        <p id="progressText">0%</p>
        `
      );

      const progress = document.getElementById("installationProgress");
      const progressText = document.getElementById("progressText");
      let value = 0;

      const interval = setInterval(() => {
        value += Math.floor(Math.random() * 25) + 4;
        if (value >= 100) {
          value = 100;
          page = 4;
          clearInterval(interval);
          updatePage();
          return;
        }
        progress.value = value;
        progressText.textContent = `${value}%`;
      }, 800);

      break;
    }
    case 4: {
      startDesktop();
    }
  }
}

updatePage();

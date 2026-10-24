# Clawd for Claude Code 🦀

**English** · [Español](#español)

A living pixel-art mascot for Claude Code. Clawd walks above your prompt bar, reacts to what Claude is doing and, if you drag him out, lives on your desktop: he climbs the screen edges, asks you for permissions, lets you write to Claude and shows your usage limits, all without opening the app.

> **Unofficial fan project.** Clawd is the mascot of Claude Code and belongs to Anthropic. This project is not affiliated with, endorsed by or sponsored by Anthropic. The MIT license covers this project's code only, not the character or any Anthropic trademark.

## Install

In a terminal session:

```
/plugin install clawd-band --marketplace OWNER/clawd-for-claude
```

From a shell:

```
claude plugin install clawd-band --marketplace OWNER/clawd-for-claude
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `OWNER/clawd-for-claude` → **Add plugin**.

You will be asked to add the marketplace (answer `y`) and to pick a scope (user scope makes Clawd appear in every session). If the repository is private, you need to be able to read it on GitHub and have a git credential for github.com on your machine.

## What Clawd does

**Above the prompt bar** (Claude desktop app; a simpler version in the terminal):

- Walks, waves, jumps, sits on the edge of the bar, stretches, sleeps when nothing happens, sometimes chases a firefly or sneezes. Now and then he tells a little story: he plays with a paper plane (throws it and watches it glide), studies a map (turns it round: "where am I?"), or puts on headphones and dances to the beat. On the desktop he can also spot a butterfly, chase it, stop, hold out his hand (the little square) and let it land softly.
- **Several sessions at once:** every open Claude Code session gets its own Clawd colour so you can tell them apart: the first one is orange, then blue, yellow, white, green, pink, purple and turquoise. The colour is also his band, his tiny spinner Clawd, his buttons and his speech bubbles. When a session closes its colour is freed, so the next one you open is orange again if it was the first. When two Clawds cross paths on the desktop and neither is working, they greet each other (a fist bump or a high five, picked at random), then go their own way.
- His eyes follow your mouse and, while you type, follow your text cursor. He tilts a little toward the side you are writing on.
- Thinking: types on his laptop with three dots over his head. Searching the web: reads a book. Tool call: his laptop, with little stars each time a tool finishes. Failure: he shakes. Done: he celebrates (only for turns you asked for, not for background tasks).
- You can grab him (hold the left button), pet him (right click) or poke him (a quick left click).

**On your desktop** (drag him out of the bar; Windows only):

- He walks along the bottom edge of your screen and on top of the Claude window, climbs the edges of the screen with his two little hands, and hangs from the top edge.
- He shows what Claude is doing: laptop while working, book while searching the web.
- When Claude asks for permission, he raises his hands with three buttons: **Allow**, **No** or **Claude** (opens the normal dialog in the app). If the command is too long to be shown in full, the first button becomes **Review** and opens the app's dialog instead, so you never approve something you have not read in full. If you do not answer within 3 minutes, the app's dialog is used.
- When Claude finishes and you are not looking at it, he peeks up from the corner of your screen (or, if he is out walking, jumps with a bubble) and **keeps saying so until you go back to the Claude window or pet him** (right-click); a left click on the bubble takes you to Claude. If you were already looking at Claude, the notice is brief. His windows always stay in front: if another window covers him he comes back on top.
- **Double left click:** your usage limits (session and week) in a large window: used, remaining and when they reset. It grows when you point at it.
- **Double right click:** a small box to write to Claude without opening the app (Enter sends, Esc closes). Clawd looks at what you type with curiosity.
- Drop him on top of the prompt bar to put him back in.
- If you write in the app while he is outside, he walks over to the prompt bar to look at your text.

### Commands

`/clawd` with: `sleep`, `wake`, `out` (go to the desktop), `home` (back to the bar), `hide`, `show`, `mini` (toggle the tiny Clawd next to the "working" row). Spanish names also work: `dormir`, `despertar`, `fuera`, `casa`, `ocultar`, `mostrar`.

## Requirements

- Claude Code with support for mods (plugins whose hooks module draws UI).
- The band above the prompt bar needs the Claude desktop app (terminal and VS Code get simpler versions).
- The desktop Clawd needs **Windows**. On first use the plugin compiles a ~50 KB helper from its own source (`desktop/ClawdDesktop.cs`) with the C# compiler that comes with Windows (`csc.exe`, .NET Framework 4). Nothing is downloaded. Without Windows, everything in the band still works.

## Language

Texts are shown in Spanish if your Windows language is Spanish, and in English otherwise. For the desktop helper you can force it with the `CLAWD_LANG` environment variable (`en` or `es`).

## Privacy and safety

- Everything runs on your computer. Clawd uses **no network** and sends **nothing to the model**, so it costs no tokens. The only text that reaches Claude is what you type in his box.
- The desktop helper reads your mouse position and finds the Claude window by its title and process name. It stores nothing.
- It talks to the plugin through a few small files inside the plugin folder (`desktop/bin/`).
- The permission buttons only exist while Clawd is outside the bar, and only for the prompts the app would ask you anyway.
- To read the code that runs on your desktop: [`desktop/ClawdDesktop.cs`](desktop/ClawdDesktop.cs).

## Uninstall

```
/plugin uninstall clawd-band
```

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT, see [LICENSE](LICENSE). Clawd and Claude are Anthropic's; this is an unofficial fan project.

---

<a id="español"></a>

# Clawd para Claude Code 🦀

[English](#clawd-for-claude-code-) · **Español**

Una mascota viva en pixel art para Claude Code. Clawd camina sobre tu barra de escribir, reacciona a lo que hace Claude y, si lo sacas arrastrándolo, vive en tu escritorio: trepa por los bordes de la pantalla, te pide permisos, te deja escribirle a Claude y te enseña tus límites de uso, todo sin abrir la app.

> **Proyecto de fans, no oficial.** Clawd es la mascota de Claude Code y pertenece a Anthropic. Este proyecto no está afiliado, respaldado ni patrocinado por Anthropic. La licencia MIT cubre solo el código de este proyecto, no el personaje ni ninguna marca de Anthropic.

## Instalar

En una sesión de terminal:

```
/plugin install clawd-band --marketplace OWNER/clawd-for-claude
```

Desde una consola:

```
claude plugin install clawd-band --marketplace OWNER/clawd-for-claude
```

En la app de escritorio, donde `/plugin` no funciona: pulsa **+** junto a la caja de mensaje → **Plugins** → **Añadir marketplace** con `OWNER/clawd-for-claude` → **Añadir plugin**.

Te preguntará si añades el marketplace (responde `y`) y el ámbito (el de usuario hace que Clawd salga en todas tus sesiones). Si el repositorio es privado, tienes que poder leerlo en GitHub y tener una credencial de git para github.com en tu equipo.

## Qué hace Clawd

**Sobre la barra de escribir** (app de escritorio de Claude; una versión más sencilla en la terminal):

- Camina, saluda, salta, se sienta en el borde de la barra, se estira, se duerme si no pasa nada, a veces persigue una luciérnaga o estornuda. De vez en cuando cuenta una pequeña historia: juega con un avión de papel (lo lanza y lo ve planear), mira un mapa (lo gira: «¿dónde estoy?») o se pone unos cascos y baila al ritmo. En el escritorio, además, puede ver una mariposa, perseguirla, pararse, extender la mano (el cuadradito) y dejar que se pose suavemente.
- **Varias sesiones a la vez:** cada sesión de Claude Code abierta tiene su Clawd de un color para distinguirlas: la primera es naranja, luego azul, amarilla, blanca, verde, rosa, morada y turquesa. El color es también el de su banda, su Clawd diminuto, sus botones y sus bocadillos. Al cerrar una sesión, su color queda libre: la siguiente que abras vuelve a ser naranja si era la primera. Si dos Clawd se cruzan por el escritorio y ninguno está trabajando, se saludan (un choque de puños o chocan esos cinco, al azar) y cada uno sigue a lo suyo.
- Sus ojos siguen tu ratón y, mientras escribes, tu cursor de texto. Se inclina un poco hacia el lado por donde escribes.
- Pensando: teclea en su portátil con tres puntitos encima. Buscando en internet: lee un libro. Herramienta: su portátil, con estrellitas cada vez que termina una. Fallo: se sacude. Terminado: celebra (solo en los turnos que pediste tú, no en tareas en segundo plano).
- Puedes agarrarlo (mantén el botón izquierdo), acariciarlo (clic derecho) o sobresaltarlo (clic izquierdo rápido).

**En tu escritorio** (arrástralo fuera de la barra; solo Windows):

- Camina por el borde inferior de tu pantalla y sobre la ventana de Claude, trepa por los bordes de la pantalla con sus dos manitas y se cuelga del borde de arriba.
- Enseña lo que hace Claude: portátil mientras trabaja, libro mientras busca en internet.
- Cuando Claude pide permiso, levanta las manitas con tres botones: **Permitir**, **No** o **Claude** (abre el diálogo normal de la app). Si el comando es demasiado largo para verse entero, el primer botón pasa a ser **Revisar** y abre el diálogo de la app, así nunca apruebas algo que no has leído completo. Si no contestas en 3 minutos, se usa el diálogo de la app.
- Cuando Claude termina y no lo estás mirando, se asoma por la esquina de tu pantalla (o, si está paseando, salta con un bocadillo) y **se queda avisando hasta que vuelvas a la ventana de Claude o lo acaricies** (clic derecho); un clic izquierdo en el bocadillo te lleva a Claude. Si ya estabas mirando Claude, el aviso es breve. Sus ventanas van siempre por delante: si otra lo tapa, vuelve a ponerse encima.
- **Doble clic izquierdo:** tus límites de uso (sesión y semana) en una ventana grande: lo usado, lo que queda y cuándo se renuevan. Se agranda al acercar el ratón.
- **Doble clic derecho:** una cajita para escribirle a Claude sin abrir la app (Intro envía, Esc cierra). Clawd mira con curiosidad lo que escribes.
- Déjalo caer encima de la barra de escribir para volver a meterlo.
- Si escribes en la app mientras está fuera, se acerca a la barra a mirar tu texto.

### Comandos

`/clawd` con: `dormir`, `despertar`, `fuera` (al escritorio), `casa` (vuelve a la barra), `ocultar`, `mostrar`, `mini` (activa o desactiva el Clawd diminuto de la fila «trabajando»). También valen los nombres en inglés: `sleep`, `wake`, `out`, `home`, `hide`, `show`.

## Requisitos

- Claude Code con soporte para mods (plugins cuyo módulo de hooks dibuja interfaz).
- La banda sobre la barra de escribir necesita la app de escritorio de Claude (terminal y VS Code tienen versiones más sencillas).
- El Clawd de escritorio necesita **Windows**. La primera vez, el plugin compila un programa auxiliar de ~50 KB desde su propio código (`desktop/ClawdDesktop.cs`) con el compilador de C# que trae Windows (`csc.exe`, .NET Framework 4). No se descarga nada. Sin Windows, todo lo de la banda funciona igual.

## Idioma

Los textos salen en español si tu Windows está en español y en inglés en cualquier otro caso. Para el programa de escritorio puedes forzarlo con la variable de entorno `CLAWD_LANG` (`en` o `es`).

## Privacidad y seguridad

- Todo se ejecuta en tu ordenador. Clawd **no usa la red** y **no envía nada al modelo**, así que no gasta tokens. El único texto que llega a Claude es el que escribes en su cajita.
- El programa de escritorio lee la posición de tu ratón y encuentra la ventana de Claude por su título y nombre de proceso. No guarda nada.
- Habla con el plugin por unos pocos archivos pequeños dentro de la carpeta del plugin (`desktop/bin/`).
- Los botones de permiso solo existen mientras Clawd está fuera de la barra, y solo para las preguntas que la app te haría igualmente.
- Para leer el código que se ejecuta en tu escritorio: [`desktop/ClawdDesktop.cs`](desktop/ClawdDesktop.cs).

## Desinstalar

```
/plugin uninstall clawd-band
```

## Desarrollo

```
claude plugin validate .
claude plugin test .
```

## Licencia

MIT, ver [LICENSE](LICENSE). Clawd y Claude son de Anthropic; este es un proyecto de fans no oficial.

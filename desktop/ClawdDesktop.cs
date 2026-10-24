// Clawd de escritorio: cuando lo sacas de la banda de Claude, vive por tu pantalla.
//
// Ventana sin bordes, transparente y siempre encima, del tamaño del sprite (no tapa nada más ni roba el foco).
// La mueve el propio Windows a 60 fps: agarrarlo, colgar, caer, andar y trepar son totalmente fluidos.
//
//   · Anda por el borde inferior de la pantalla y por encima de la ventana de Claude (si no está maximizada).
//   · Trepa por los bordes de la pantalla con las manitas y se cuelga del borde de arriba, mano tras mano.
//   · Para que vuelva a la banda, déjalo caer encima de la barra de escribir de Claude.
//   · Cuando Claude termina y no lo estás mirando, asoma por la esquina con un bocadillo (clic: te lleva a Claude).
//   · Enseña lo que hace Claude: teclea en su portátil (o lee su libro si busca en internet), con una etiqueta.
//   · Si Claude pide permiso, levanta las manitas con botones: Permitir, No, o Claude (el diálogo de la app).
//   · Mantén pulsado el clic izquierdo para agarrarlo. Doble clic izquierdo: cuánto queda de tus límites de uso.
//     Clic derecho: caricia; doble clic derecho: una cajita para escribirle a Claude.
//
// Habla con el mod así:
//   · el mod escribe órdenes en el archivo que recibe como argumento ("<n> <orden> [datos]", varias líneas):
//       grab gx gy tilt face px py wc hc  sale de la banda colgando del ratón (gx, gy: dónde lo agarras, en
//                                        píxeles del sprite; px, py: el ratón dentro de la banda; wc x hc: la banda)
//       mood <ánimo> <etiqueta>          lo que hace Claude (thinking, tool, web, fail, done, idle)
//       ask <id> <herramienta> <resumen> <archivo>   pide permiso; la respuesta se escribe en <archivo>
//       askdone <id> | usage <ahora> <tipo:%:reinicio>... | drop | home | done | quit
//     (los textos van codificados como en una URL)
//   · Clawd responde por su salida estándar: "ready", "near 0|1" (está encima de la barra), "home <f>",
//     "usage?" (quiere ver los límites) y "say <texto>" (lo que le escribes a Claude).
//   · ClawdDesktop.exe --wait <archivo> <segundos>: espera la respuesta a un permiso y la imprime.
// Si Claude se cierra, la tubería de salida se rompe y Clawd se va con él.
//
// C# 5 (el compilador de .NET Framework que trae Windows): sin $"" ni ?.

using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

/**
 * Idioma de los textos: español si Windows está en español; inglés en cualquier otro caso. Se puede forzar con la
 * variable de entorno CLAWD_LANG (es / en).
 */
static class L
{
    public static readonly bool ES = (Environment.GetEnvironmentVariable("CLAWD_LANG") ?? CultureInfo.CurrentUICulture.TwoLetterISOLanguageName)
        .ToLowerInvariant().StartsWith("es");
    public static string T(string es, string en) { return ES ? es : en; }
}

static class Program
{
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length == 3 && args[0] == "--wait") { Wait(args[1], args[2]); return; }
        try { SetProcessDPIAware(); } catch { }
        Application.EnableVisualStyles();
        // un fallo raro nunca debe enseñar el diálogo de error de .NET: ese fotograma se pierde y Clawd sigue
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += delegate { };
        AppDomain.CurrentDomain.UnhandledException += delegate { Environment.Exit(0); };
        if (args.Length == 2 && args[0] == "--snap") { Pet.Snap(args[1]); return; }
        Application.Run(new Pet(args.Length > 0 ? args[0] : null));
    }

    /** Espera a que Clawd escriba la respuesta a un permiso (allow, deny, app) y la imprime; si no llega, "timeout". */
    static void Wait(string file, string secs)
    {
        double limit;
        if (!double.TryParse(secs, NumberStyles.Float, CultureInfo.InvariantCulture, out limit)) limit = 180;
        Stopwatch w = Stopwatch.StartNew();
        while (w.Elapsed.TotalSeconds < limit)
        {
            if (File.Exists(file))
            {
                try
                {
                    string a = File.ReadAllText(file).Trim();
                    File.Delete(file);
                    Console.Out.WriteLine(a);
                    return;
                }
                catch { }
            }
            System.Threading.Thread.Sleep(80);
        }
        Console.Out.WriteLine("timeout");
    }
}

class Pet : Form
{
    // ── Windows ──────────────────────────────────────────────────────────────
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int index);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    static readonly IntPtr TOPMOST = new IntPtr(-1);
    const uint SWP_NOACTIVATE = 0x10, SWP_NOSIZE = 0x1, SWP_SHOWWINDOW = 0x40;

    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x08000000 | 0x80 | 0x8; // NOACTIVATE | TOOLWINDOW | TOPMOST
            return cp;
        }
    }

    // ── el sprite (14 x 11 píxeles, como en la banda) ────────────────────────
    const int GW = 14, GH = 11;
    const int MX = 16, MT = 21, MB = 2; // márgenes en píxeles del sprite: costados y encima (bocadillos), debajo
    static readonly Color BODY = ColorTranslator.FromHtml("#D97757");
    static readonly Color SHADE = ColorTranslator.FromHtml("#B85C3E");
    static readonly Color DARK = ColorTranslator.FromHtml("#1f1a17");
    static readonly Color PINK = ColorTranslator.FromHtml("#ff8fb1");
    static readonly Color BLUE = ColorTranslator.FromHtml("#7db8ff");
    static readonly Color YELLOW = ColorTranslator.FromHtml("#f3c969");
    static readonly Color PAPER = ColorTranslator.FromHtml("#fbf7f0");
    static readonly Color KEY = Color.FromArgb(255, 0, 255);
    static readonly Color WHITE = ColorTranslator.FromHtml("#f8fafc");
    static readonly Color GREEN = ColorTranslator.FromHtml("#63d2a1");
    static readonly Color METAL = ColorTranslator.FromHtml("#c3c7d3");
    static readonly Color SCREEN = ColorTranslator.FromHtml("#262a36");
    static readonly Color COVER = ColorTranslator.FromHtml("#6b4a35");
    static readonly Color PAGE = ColorTranslator.FromHtml("#f4ead2");
    static readonly Color PAGEDIM = ColorTranslator.FromHtml("#cdbd98");
    static readonly Color MUTED = ColorTranslator.FromHtml("#8a7f74");
    static readonly Color TRACK = ColorTranslator.FromHtml("#eadfd2");
    static readonly Color STAR = ColorTranslator.FromHtml("#fff3c0");
    static readonly Color RED = ColorTranslator.FromHtml("#ff7a70");
    static readonly Color FOLD = ColorTranslator.FromHtml("#cdd3dc");
    static readonly Color FOLD2 = ColorTranslator.FromHtml("#aeb6c4");
    static readonly Color CUP = ColorTranslator.FromHtml("#2b2f3a");
    static readonly Color CUP2 = ColorTranslator.FromHtml("#454c60");
    static readonly Color BLUE2 = ColorTranslator.FromHtml("#5a93d6");
    double typeTargetX; // escribiendo en la app: x (pantalla) hacia donde se acerca a mirar
    bool typeRemote; // el aviso de escritura viene de la app (no de su cajita)
    double sparkAt = -9; // cuándo se completó la última herramienta: estrellitas en el portátil

    enum S { Hidden, Held, Fall, Land, Idle, Walk, Sit, Sleep, Wave, Petting, Dizzy, Climb, Cling, Hang, Peek, Announce, Work, Asking, Curious, Alert, Plane, Map, Music, Chase }

    // lo que hace Claude (llega con "mood")
    bool working, webMood, failMood;
    bool thinkingMood; // Claude está pensando (tres puntitos)

    // permisos pendientes (llegan con "ask"): el primero se enseña con sus botones
    class Ask { public string Id, Tool, Summary, File; }
    readonly System.Collections.Generic.List<Ask> asks = new System.Collections.Generic.List<Ask>();
    RectangleF btnAllow, btnDeny, btnApp;
    bool askCut; // el resumen del permiso no cabe entero: "Permitir" pasa a "Revisar" (se ve completo en la app)

    // los límites de uso (llegan con "usage"): una ventanita grande encima de Clawd
    string[] usageRows;
    UsagePanel usage;

    // ratón: mantener pulsado para agarrarlo; dobles clics
    bool pressPending;
    double pressAt, lastLeftClick = -9, lastRightClick = -9;
    Point pressPos;
    PromptBox box;
    Point caretAt; // escribiendo en la cajita: dónde va el cursor de texto (pantalla)
    double lastTypeAt = -9;

    readonly string cmdPath;
    readonly Stopwatch clock = Stopwatch.StartNew();
    readonly Random rnd = new Random();
    readonly Timer frame = new Timer();
    readonly Timer watch = new Timer();
    FileSystemWatcher fsw;
    int P = 4; // píxeles de pantalla por píxel del sprite (según los ppp)
    double DS = 1; // píxeles de pantalla por píxel CSS de Claude
    int lastSeq = -1;
    bool skipOld;
    double lastT, lastBeat;

    S st = S.Hidden;
    double stT, holdFor;
    double x, y, vx, vy; // posición de los pies (centro abajo), en píxeles de pantalla
    double walkTo;
    int face = 1;
    int wall; // trepando: -1 pared izquierda, 1 derecha
    double hangLeft; // colgado arriba: cuánto le queda por recorrer
    double fs = 1; // escala horizontal suavizada: el giro de cara es una animación, no un salto
    double gx, gy; // mirada suavizada (en el sentido de la cara)
    double tilt, tiltV; // colgando: péndulo amortiguado
    double hard; // fuerza del último golpe (para marearse)
    bool bounced, nearNow;
    bool armed = true; // recién sacado de la banda: la pista de "suéltalo aquí" espera a que lo alejes una vez
    bool thrown; // esta caída empezó porque tú lo soltaste (solo así entra en la banda al caer sobre la barra)
    double grabDx, grabDy; // dónde lo agarraste, respecto al punto de agarre de la cabeza
    Point lastCur;
    double curVx, curVy, lastMoveT;
    double blinkAt = 2;
    double peekBase; // asomarse: dónde está el suelo
    double climbY0; // trepando: dónde empezó este tramo (los pies)
    S alertFrom; // "¡!": de dónde lo sacó Claude (trepando o colgado)
    double snapT = -1; // solo para las pruebas sin pantalla
    bool askLong; // solo para las pruebas sin pantalla: un permiso con un comando muy largo

    // historias (avión de papel, mapa, cascos, mariposa)
    PropWin prop; // la ventanita que se pasea con el avión o la mariposa
    StoryPose spose;
    Story.PlaneFrame planeF; Story.MapFrame mapF; Story.MusicFrame musicF; Story.ChaseFrame chaseF;
    Story.ChaseSim chaseSim;
    double storyX0, bPhase, lastStoryT, propCx, propCy;
    int storyDir = 1; // hacia dónde vuela el avión o va la mariposa (el lado con sitio)
    bool propShow, snapping;

    // la banda de Claude (y la barra de escribir debajo), relativa a su ventana: dónde hay que soltarlo
    bool hasBand;
    double bandOffL, bandOffB, bandW, bandH;

    public Pet(string cmd)
    {
        cmdPath = cmd;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = KEY;
        TransparencyKey = KEY;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint, true);
        using (Graphics g = CreateGraphics())
        {
            DS = g.DpiX / 96.0;
            P = Math.Max(3, (int)Math.Round(4.025 * DS)); // el mismo tamaño que en la banda
        }
        ClientSize = new Size((GW + 2 * MX) * P, (MT + GH + MB) * P);
        Location = new Point(-5000, -5000);

        frame.Interval = 15;
        frame.Tick += delegate { Step(); };
        watch.Interval = 120;
        watch.Tick += delegate { Poll(); };
        watch.Start();

        MouseDown += OnDown;
        MouseUp += OnUp;
        SkipOldCommands();
        if (cmdPath != null)
        {
            try
            {
                // la orden llega al instante (y, por si acaso, se revisa cada 120 ms)
                fsw = new FileSystemWatcher(Path.GetDirectoryName(cmdPath), Path.GetFileName(cmdPath));
                fsw.NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size;
                fsw.SynchronizingObject = this;
                fsw.Changed += delegate { Poll(); };
                fsw.EnableRaisingEvents = true;
            }
            catch { }
        }
        Say("ready");
    }

    // ── comunicación ─────────────────────────────────────────────────────────

    void Say(string line)
    {
        try { Console.Out.WriteLine(line); Console.Out.Flush(); }
        catch { Application.Exit(); } // Claude se ha ido
    }

    static double Num(string[] p, int i, double def)
    {
        double v;
        return p.Length > i && double.TryParse(p[i], NumberStyles.Float, CultureInfo.InvariantCulture, out v) ? v : def;
    }

    void Poll()
    {
        double t = clock.Elapsed.TotalSeconds;
        if (t - lastBeat > 3) { lastBeat = t; Say("."); }
        if (cmdPath == null || !File.Exists(cmdPath)) return;
        string text;
        try { text = File.ReadAllText(cmdPath); } catch { return; } // cada orden lleva su número: leerla dos veces no la repite
        foreach (string raw in text.Split('\n'))
        {
            string[] p = raw.Trim().Split(' ');
            int seq;
            if (p.Length < 2 || !int.TryParse(p[0], out seq) || seq <= lastSeq) continue;
            lastSeq = seq;
            if (!skipOld) Command(p);
        }
    }

    /** Al arrancar, las órdenes que ya hubiera en el archivo son viejas: se leen sin obedecerlas. */
    void SkipOldCommands()
    {
        skipOld = true;
        Poll();
        skipOld = false;
    }

    void Command(string[] p)
    {
        string verb = p[1];
        Point c = Cursor.Position;
        if (verb == "grab")
        {
            // sale de la banda justo donde lo tenías agarrado: mismo punto de agarre, misma inclinación
            double sgx = Num(p, 2, 7), sgy = Num(p, 3, 1.5);
            grabDx = (7 - sgx) * P;
            grabDy = (1.5 - sgy) * P;
            face = Num(p, 5, 1) < 0 ? -1 : 1;
            CalibrateBand(c, Num(p, 6, -1), Num(p, 7, -1), Num(p, 8, 0), Num(p, 9, 0));
            Appear(c.X + grabDx, c.Y + grabDy + 9.5 * P);
            tilt = Num(p, 4, 0);
            // lo levantaste sin salir de la banda (p[10] = 1): ya está sobre la barra, así que ya está "cerca" y listo
            // para volver; si lo sacaste, la pista espera a que lo alejes una vez
            bool inside = Num(p, 10, 0) >= 1;
            nearNow = inside;
            armed = inside;
            Go(S.Held);
            Say("out");
        }
        else if (verb == "drop")
        {
            Appear(c.X, c.Y + 9.5 * P);
            vx = 0; vy = -200;
            armed = false; // aparece donde está el ratón (seguramente en la barra, de escribir el comando): no vuelve sin más
            Go(S.Fall);
            Say("out");
        }
        else if (verb == "home")
        {
            if (st == S.Hidden) return;
            Say("home " + BandFraction());
            Go(S.Hidden);
        }
        else if (verb == "done") Announce();
        else if (verb == "story")
        {
            // para pruebas: story plane|map|music|chase (hacia el lado con más sitio)
            if (st == S.Hidden || st == S.Held) return;
            string k = p.Length > 2 ? p[2] : "plane";
            Rectangle a0 = Area();
            storyDir = a0.Right - x >= x - a0.Left ? 1 : -1;
            Go(k == "map" ? S.Map : k == "music" ? S.Music : k == "chase" ? S.Chase : S.Plane);
        }
        else if (verb == "spark") sparkAt = clock.Elapsed.TotalSeconds;
        else if (verb == "type")
        {
            // estás escribiendo en la app: p[2] = por dónde va el cursor en la barra (0..1)
            RectangleF z;
            if (!DropZone(out z)) return;
            double f = Math.Max(0, Math.Min(1, Num(p, 2, 0.5)));
            typeTargetX = hasBand ? z.Left + 12 * DS + f * bandW : z.Left + f * z.Width;
            caretAt = new Point((int)typeTargetX, (int)(z.Top + z.Height * 0.55));
            lastTypeAt = clock.Elapsed.TotalSeconds;
            typeRemote = true;
        }
        else if (verb == "quit") Application.Exit();
        else if (verb == "mood")
        {
            string m = p.Length > 2 ? p[2] : "idle";
            working = m == "thinking" || m == "tool" || m == "web";
            webMood = m == "web";
            failMood = m == "fail";
            thinkingMood = m == "thinking";
            if (st == S.Hidden) return;
            // se pone a trabajar donde esté (si está tranquilo); al acabar, vuelve a lo suyo
            if (working && (st == S.Idle || st == S.Walk || st == S.Sit || st == S.Wave || st == S.Sleep || IsStory(st))) Go(S.Work);
            else if (working && (st == S.Climb || st == S.Cling || st == S.Hang)) { alertFrom = st; Go(S.Alert); }
            else if (!working && !failMood && st == S.Work) Go(S.Idle);
        }
        else if (verb == "ask" && p.Length > 5)
        {
            Ask a = new Ask();
            a.Id = p[2];
            a.Tool = Uri.UnescapeDataString(p[3]);
            a.Summary = Uri.UnescapeDataString(p[4]);
            a.File = Uri.UnescapeDataString(p[5]);
            asks.Add(a);
            if (st == S.Hidden) { Answer("app"); return; } // está en la banda: el diálogo de siempre
            if (st == S.Climb || st == S.Cling || st == S.Hang) { vx = -wall * 120; vy = -100; Go(S.Fall); }
            else if (st != S.Held && st != S.Fall) Go(S.Asking);
        }
        else if (verb == "askdone")
        {
            asks.RemoveAll(delegate (Ask a) { return a.Id == p[2]; });
            if (asks.Count == 0 && st == S.Asking) Go(working ? S.Work : S.Idle);
        }
        else if (verb == "usage")
        {
            // usage <ahora> <tipo:%usado:reinicio>...  (milisegundos desde 1970)
            double now = Num(p, 2, 0);
            System.Collections.Generic.List<string> rows = new System.Collections.Generic.List<string>();
            for (int i = 3; i < p.Length; i++)
            {
                string[] f = p[i].Split(':');
                if (f.Length < 3) continue;
                double used, reset;
                double.TryParse(f[1], NumberStyles.Float, CultureInfo.InvariantCulture, out used);
                double.TryParse(f[2], NumberStyles.Float, CultureInfo.InvariantCulture, out reset);
                string name = f[0] == "five_hour" ? L.T("Sesión", "Session") : f[0] == "seven_day" ? L.T("Semana", "Week") : f[0].Replace('_', ' ');
                rows.Add(name + "|" + used.ToString(CultureInfo.InvariantCulture) + "|" + (reset > 0 && now > 0 ? Until(reset - now) : ""));
            }
            usageRows = rows.ToArray();
            ShowUsage();
        }
    }

    /** "2 h 14 min", "35 min", "3 d 4 h": cuánto falta. */
    static string Until(double ms)
    {
        double m = Math.Max(0, ms / 60000.0);
        if (m < 1) return L.T("ya mismo", "any moment");
        if (m < 60) return ((int)Math.Ceiling(m)) + " min";
        double h = m / 60;
        if (h < 24) return ((int)h) + " h " + ((int)(m % 60)) + " min";
        return ((int)(h / 24)) + " d " + ((int)(h % 24)) + " h";
    }

    /** Contesta el permiso que está enseñando: allow, deny o app (el diálogo de la app). */
    void Answer(string what)
    {
        if (asks.Count == 0) return;
        Ask a = asks[0];
        asks.RemoveAt(0);
        try { File.WriteAllText(a.File, what); } catch { }
        if (what == "app") FocusClaude();
        if (asks.Count == 0 && st == S.Asking) Go(what == "allow" ? S.Wave : working ? S.Work : S.Idle);
    }

    /** Dónde está la banda en la pantalla: el ratón estaba en (px, py) de la banda cuando lo sacaste. */
    void CalibrateBand(Point c, double px, double py, double wc, double hc)
    {
        RECT r;
        if (px < 0 || wc <= 0 || !Claude(out r)) return;
        double left = c.X - px * DS, top = c.Y - py * DS;
        bandOffL = left - r.Left;
        bandOffB = r.Bottom - top;
        bandW = wc * DS;
        bandH = hc * DS;
        hasBand = true;
    }

    /** La zona donde soltarlo para que vuelva: la banda y la barra de escribir debajo (o, sin medir, el pie de la ventana). */
    bool DropZone(out RectangleF z)
    {
        RECT r;
        z = RectangleF.Empty;
        if (!Claude(out r)) return false;
        double w = r.Right - r.Left;
        if (hasBand)
        {
            double l = r.Left + bandOffL, t = r.Bottom - bandOffB;
            z = new RectangleF((float)(l - 12 * DS), (float)(t - 16 * DS), (float)(bandW + 24 * DS), (float)(bandH + 150 * DS));
        }
        else z = new RectangleF((float)(r.Left + w * 0.2), (float)(r.Bottom - 250 * DS), (float)(w * 0.75), (float)(235 * DS));
        return true;
    }

    string BandFraction()
    {
        RectangleF z;
        double f = 0.5;
        if (hasBand && DropZone(out z)) f = Math.Max(0, Math.Min(1, (x - z.Left - 12 * DS) / Math.Max(1, bandW)));
        return f.ToString("0.000", CultureInfo.InvariantCulture);
    }

    void Appear(double fx, double fy)
    {
        x = fx; y = fy; vx = vy = 0; tilt = tiltV = 0; fs = face;
        lastCur = Cursor.Position;
        lastT = clock.Elapsed.TotalSeconds;
        lastMoveT = lastT;
        Place();
        if (!Visible) Show();
        SetWindowPos(Handle, TOPMOST, Left, Top, 0, 0, SWP_NOACTIVATE | SWP_NOSIZE | SWP_SHOWWINDOW);
        frame.Start();
        Invalidate();
        Update(); // se pinta ya, sin esperar al siguiente fotograma
    }

    void OnDown(object sender, MouseEventArgs e)
    {
        if (st == S.Hidden) return;
        if (st == S.Peek || st == S.Announce)
        {
            // clic en el aviso: te lleva a Claude
            FocusClaude();
            if (st == S.Peek) { stT = Math.Max(stT, 5.6); return; }
            Go(S.Idle);
            return;
        }
        double t = clock.Elapsed.TotalSeconds;
        double dbl = SystemInformation.DoubleClickTime / 1000.0;
        // los botones del permiso
        if (asks.Count > 0 && e.Button == MouseButtons.Left)
        {
            if (btnAllow.Contains(e.Location)) { Answer(askCut ? "app" : "allow"); return; } // recortado: se revisa en la app, nunca se aprueba a ciegas
            if (btnDeny.Contains(e.Location)) { Answer("deny"); return; }
            if (btnApp.Contains(e.Location)) { Answer("app"); return; }
        }
        if (e.Button == MouseButtons.Right)
        {
            // doble clic derecho: escribirle a Claude; uno solo: caricia
            if (t - lastRightClick < dbl) { lastRightClick = -9; OpenBox(); return; }
            lastRightClick = t;
            if (st != S.Asking) Go(S.Petting);
            return;
        }
        if (e.Button != MouseButtons.Left) return;
        // para agarrarlo hay que mantener pulsado (o empezar a arrastrar): un clic suelto no lo levanta
        pressPending = true;
        pressAt = t;
        pressPos = Cursor.Position;
    }

    void OnUp(object sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left || !pressPending) return;
        pressPending = false;
        double t = clock.Elapsed.TotalSeconds;
        if (t - lastLeftClick < SystemInformation.DoubleClickTime / 1000.0)
        {
            // doble clic izquierdo: los límites de uso
            lastLeftClick = -9;
            Say("usage?");
            return;
        }
        lastLeftClick = t;
        if (st == S.Idle || st == S.Sit || st == S.Work || st == S.Walk) { hard = 0; Go(S.Land); } // un clic: boing
    }

    /** Empieza a colgar de tu mano, por donde lo has agarrado (pero siempre de la cabeza). */
    void StartGrab(Point at)
    {
        double headX = x, headY = y - 9.5 * P;
        grabDx = Math.Max(-4 * P, Math.Min(4 * P, headX - at.X));
        grabDy = Math.Max(-3 * P, Math.Min(3 * P, headY - at.Y));
        Go(S.Held);
    }

    /** Doble clic izquierdo: tus límites de uso, en grande, encima de Clawd. */
    void ShowUsage()
    {
        if (usage != null && !usage.IsDisposed) usage.Close();
        usage = new UsagePanel(DS, usageRows ?? new string[0]);
        usage.AnchorAt(new Point((int)x, (int)(y - (GH + 3) * P)), Area());
        usage.Show();
    }

    /** Doble clic derecho: una cajita encima de Clawd para escribirle a Claude sin abrir la app. */
    void OpenBox()
    {
        if (box != null && !box.IsDisposed) { box.Activate(); return; }
        box = new PromptBox(P, DS, delegate (string text)
        {
            Say("say " + Uri.EscapeDataString(text));
            if (st != S.Held && st != S.Fall && st != S.Asking) Go(S.Wave);
        });
        box.Caret = delegate (Point at) { caretAt = at; lastTypeAt = clock.Elapsed.TotalSeconds; typeRemote = false; };
        int w = box.Width;
        Rectangle a = Area();
        int bx = Math.Max(a.Left + 8, Math.Min(a.Right - w - 8, (int)x - w / 2));
        int by = Math.Max(a.Top + 8, (int)(y - (GH + 4) * P) - box.Height);
        box.Location = new Point(bx, by);
        box.Show();
        box.Activate();
        caretAt = new Point(box.Left + 12, box.Top + box.Height / 2);
        if (st != S.Held && st != S.Fall && st != S.Asking && st != S.Climb && st != S.Cling && st != S.Hang) Go(S.Curious);
    }

    // ── la ventana de Claude ─────────────────────────────────────────────────

    IntPtr claudeH = IntPtr.Zero;
    RECT claudeR;
    double claudeAt = -1;

    bool Claude(out RECT r)
    {
        double t = clock.Elapsed.TotalSeconds;
        if (t - claudeAt > 0.3)
        {
            claudeAt = t;
            claudeH = FindClaude(out claudeR);
        }
        r = claudeR;
        return claudeH != IntPtr.Zero;
    }

    static IntPtr FindClaude(out RECT found)
    {
        RECT best = new RECT();
        IntPtr hit = IntPtr.Zero;
        EnumWindows(delegate (IntPtr h, IntPtr l)
        {
            if (!IsWindowVisible(h) || IsIconic(h)) return true;
            StringBuilder sb = new StringBuilder(64);
            GetWindowText(h, sb, 64);
            if (sb.ToString() != "Claude") return true;
            uint pid;
            GetWindowThreadProcessId(h, out pid);
            try
            {
                if (!Process.GetProcessById((int)pid).ProcessName.Equals("claude", StringComparison.OrdinalIgnoreCase)) return true;
            }
            catch { return true; }
            RECT r;
            if (GetWindowRect(h, out r) && r.Right - r.Left > 200) { best = r; hit = h; return false; }
            return true;
        }, IntPtr.Zero);
        found = best;
        return hit;
    }

    void FocusClaude()
    {
        RECT r;
        if (!Claude(out r)) return;
        if (IsIconic(claudeH)) ShowWindow(claudeH, 9);
        SetForegroundWindow(claudeH);
    }

    // ── el mundo ─────────────────────────────────────────────────────────────

    Rectangle Area() { return Screen.FromPoint(new Point((int)x, (int)y - P)).WorkingArea; }

    /** El suelo bajo sus pies: el borde inferior de la pantalla, o el techo de la ventana de Claude si está encima. */
    double FloorAt(double px, double py)
    {
        Rectangle a = Area();
        double f = a.Bottom;
        RECT r;
        if (Claude(out r) && r.Top > a.Top + 10 && px > r.Left + 3 * P && px < r.Right - 3 * P && py <= r.Top + 3) f = Math.Min(f, r.Top);
        return f;
    }

    void Go(S s)
    {
        if (IsStory(st) && !IsStory(s)) HideProp(); // la historia se corta: fuera el avión o la mariposa
        if (s == S.Fall) thrown = st == S.Held; // ¿lo has soltado tú? (no: /clawd fuera, saltar de la pared...)
        st = s; stT = 0; holdFor = 0;
        if (s == S.Hidden)
        {
            frame.Stop(); Hide(); Location = new Point(-5000, -5000); SetNear(false);
            foreach (Ask a in asks) { try { File.WriteAllText(a.File, "app"); } catch { } }
            asks.Clear();
            if (usage != null && !usage.IsDisposed) usage.Close();
            ducked = false;
        }
        else if (s == S.Climb) climbY0 = y;
        else if (s == S.Held) { tiltV = 0; }
        else if (s == S.Fall) { bounced = false; hard = 0; }
        else if (s == S.Idle) holdFor = 1.5 + rnd.NextDouble() * 3;
        else if (s == S.Sit) holdFor = 6 + rnd.NextDouble() * 6;
        else if (s == S.Wave) holdFor = 1.6;
        else if (s == S.Petting) holdFor = 1.6;
        else if (s == S.Dizzy) holdFor = 1.7;
        else if (s == S.Land) holdFor = 0.38;
        else if (s == S.Cling) holdFor = 1.2 + rnd.NextDouble() * 1.5;
        else if (s == S.Announce) holdFor = 5;
        else if (IsStory(s)) StartStory(s);
    }

    bool ducked; // escondido porque hay algo a pantalla completa delante
    double duckCheckAt;

    /** ¿Hay delante una ventana a pantalla completa de verdad (sin barra de título, tapando toda la pantalla)? */
    bool FullscreenAhead()
    {
        IntPtr fg = GetForegroundWindow();
        if (fg == IntPtr.Zero || fg == Handle) return false;
        if ((box != null && !box.IsDisposed && fg == box.Handle) || (usage != null && !usage.IsDisposed && fg == usage.Handle)) return false;
        StringBuilder cls = new StringBuilder(64);
        GetClassName(fg, cls, 64);
        string c = cls.ToString();
        if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") return false; // el escritorio y la barra de tareas
        if ((GetWindowLong(fg, -16) & 0x00C00000) == 0x00C00000) return false; // tiene barra de título: una ventana maximizada, no pantalla completa
        RECT r;
        if (!GetWindowRect(fg, out r)) return false;
        Rectangle b = Screen.FromHandle(fg).Bounds;
        return r.Left <= b.Left && r.Top <= b.Top && r.Right >= b.Right && r.Bottom >= b.Bottom;
    }

    void DuckForFullscreen()
    {
        double t = clock.Elapsed.TotalSeconds;
        if (t - duckCheckAt < 0.4) return;
        duckCheckAt = t;
        bool want = st != S.Hidden && st != S.Held && FullscreenAhead();
        if (want && !ducked) { ducked = true; if (IsStory(st)) Go(S.Idle); Hide(); }
        else if (!want && ducked)
        {
            ducked = false;
            if (st != S.Hidden) { Show(); SetWindowPos(Handle, TOPMOST, Left, Top, 0, 0, SWP_NOACTIVATE | SWP_NOSIZE | SWP_SHOWWINDOW); }
        }
    }

    /** Lo que toca cuando no hace nada especial: contestar un permiso, trabajar con Claude o descansar. */
    S Calm() { return asks.Count > 0 ? S.Asking : working ? S.Work : S.Idle; }

    void SetNear(bool on)
    {
        if (on == nearNow) return;
        nearNow = on;
        Say(on ? "near 1" : "near 0");
    }

    /** ¿Estás escribiendo en la app (no en su cajita) hace nada? Entonces se acerca a la barra a mirar. */
    bool RemoteTyping()
    {
        return typeRemote && clock.Elapsed.TotalSeconds - lastTypeAt < 2.5 && !(box != null && !box.IsDisposed && box.Visible);
    }

    /** Camina hasta quedarse debajo de por dónde escribes y se queda mirando la barra con curiosidad. */
    void ApproachBar()
    {
        Rectangle a = Area();
        double half = (GW / 2.0 + 1) * P;
        double tx = Math.Max(a.Left + half, Math.Min(a.Right - half, typeTargetX));
        if (Math.Abs(tx - x) > 40 * P) { walkTo = tx; face = tx < x ? -1 : 1; Go(S.Walk); }
        else Go(S.Curious);
    }

    void Decide()
    {
        if (RemoteTyping()) { Go(S.Curious); return; } // llegó (o está) junto a la barra mientras escribes
        if (Calm() != S.Idle) { Go(Calm()); return; } // mientras Claude trabaja (o pide permiso), está con él
        Rectangle a = Area();
        double r = rnd.NextDouble();
        if (st == S.Walk || st == S.Sit || st == S.Wave || st == S.Petting || st == S.Dizzy || st == S.Land || st == S.Announce || IsStory(st))
        {
            if (st == S.Walk && r < 0.3) { Go(S.Sit); return; }
            Go(S.Idle);
            return;
        }
        double half = (GW / 2.0 + 1) * P;
        double lo = a.Left + half, hi = a.Right - half;
        RECT cr;
        bool onClaude = Claude(out cr) && Math.Abs(y - cr.Top) < 3 && cr.Top > a.Top + 10;
        if (onClaude) { lo = cr.Left + 6 * P; hi = cr.Right - 6 * P; }
        if (rnd.NextDouble() < 0.09 && TryStory()) return; // de vez en cuando, una historia
        if (!onClaude && r < 0.16)
        {
            // a una pared, para trepar
            walkTo = rnd.NextDouble() < 0.5 ? lo : hi;
            face = walkTo < x ? -1 : 1;
            Go(S.Walk);
        }
        else if (r < 0.6)
        {
            walkTo = Math.Max(lo, Math.Min(hi, x + (rnd.NextDouble() < 0.5 ? -1 : 1) * (80 + rnd.NextDouble() * 360)));
            face = walkTo < x ? -1 : 1;
            Go(S.Walk);
        }
        else if (r < 0.72) Go(S.Wave);
        else if (r < 0.86) Go(S.Sit);
        else Go(S.Idle);
    }

    /** Claude ha terminado: si lo estás viendo pasear, salta con un bocadillo; si no, se asoma por la esquina. */
    void Announce()
    {
        RECT r;
        bool claudeFront = Claude(out r) && GetForegroundWindow() == claudeH;
        if (st != S.Hidden)
        {
            if (st == S.Held || st == S.Fall) return;
            if (st == S.Climb || st == S.Cling || st == S.Hang) { vx = -wall * 120; vy = -100; Go(S.Fall); }
            Go(S.Announce);
            return;
        }
        if (claudeFront) return; // ya lo ves en la banda
        if (FullscreenAhead()) return; // estás jugando o viendo algo a pantalla completa: no molesta
        Rectangle a = Screen.FromPoint(Cursor.Position).WorkingArea;
        face = -1;
        peekBase = a.Bottom;
        Appear(a.Right - 26 * P, a.Bottom + 12 * P);
        Go(S.Peek);
    }

    /** Un fotograma: la lógica (a prueba de fallos), la pantalla completa y el ritmo de fotogramas. */
    void Step()
    {
        try { StepCore(); } catch (Exception ex) { Dbg(ex); }
        try { DuckForFullscreen(); } catch { }
        // tranquilo (sentado, trabajando, durmiendo...) basta con ~30 fps; moviéndose, ~60
        bool calm = st == S.Idle || st == S.Sit || st == S.Sleep || st == S.Work || st == S.Asking || st == S.Curious || st == S.Petting || st == S.Wave;
        int want = calm ? 33 : 15;
        if (frame.Interval != want) frame.Interval = want;
    }

    void StepCore()
    {
        double t = clock.Elapsed.TotalSeconds;
        double dt = Math.Min(0.05, Math.Max(0.001, t - lastT));
        lastT = t;
        stT += dt;

        // el ratón: velocidad (para colgar y lanzar), si se ha movido (para dormirse) y mirada
        Point c = Cursor.Position;
        double cvx = (c.X - lastCur.X) / dt, cvy = (c.Y - lastCur.Y) / dt;
        curVx += (cvx - curVx) * Math.Min(1, dt * 18);
        curVy += (cvy - curVy) * Math.Min(1, dt * 18);
        if (c != lastCur) lastMoveT = t;
        lastCur = c;

        bool boxOpen = box != null && !box.IsDisposed && box.Visible;
        bool remoteTyping = RemoteTyping();
        if (boxOpen && (st == S.Idle || st == S.Sit || st == S.Work || st == S.Wave || st == S.Walk || st == S.Sleep || IsStory(st))) Go(S.Curious);
        else if (remoteTyping && (st == S.Idle || st == S.Sit || st == S.Work || st == S.Wave || st == S.Sleep || IsStory(st))) ApproachBar();
        else if (remoteTyping && st == S.Curious && Math.Abs(typeTargetX - x) > 60 * P) ApproachBar(); // escribes más lejos: lo sigue
        else if (!boxOpen && !remoteTyping && st == S.Curious) Go(Calm());

        // mantener pulsado (o empezar a arrastrar) lo agarra; soltar antes es un clic (lo atiende OnUp)
        if (pressPending && (GetAsyncKeyState(0x01) & 0x8000) != 0)
        {
            int pdx = c.X - pressPos.X, pdy = c.Y - pressPos.Y;
            if (t - pressAt >= 0.2 || pdx * pdx + pdy * pdy > 25) { pressPending = false; StartGrab(pressPos); }
        }

        Rectangle a = Area();
        double half = (GW / 2.0 + 1) * P;
        RectangleF zone;
        bool hasZone = DropZone(out zone);

        switch (st)
        {
            case S.Held:
                {
                    bool down = (GetAsyncKeyState(0x01) & 0x8000) != 0;
                    // sigue al ratón con un poquito de retardo (suave, nunca a saltos)
                    double tx = c.X + grabDx, ty = c.Y + grabDy + 9.5 * P;
                    double k = Math.Min(1, dt * 30);
                    x += (tx - x) * k;
                    y += (ty - y) * k;
                    // péndulo: lo inclina la velocidad del ratón y vuelve con un muelle amortiguado
                    double target = Math.Max(-38, Math.Min(38, -curVx * 0.035));
                    tiltV += ((target - tilt) * 140 - tiltV * 9) * dt;
                    tilt += tiltV * dt;
                    if (Math.Abs(curVx) > 40) face = curVx < 0 ? -1 : 1;
                    bool overBar = hasZone && zone.Contains(c.X, c.Y);
                    bool close = hasZone && Inflate(zone, (nearNow ? 150 : 90) * DS).Contains(c.X, c.Y); // entra a 90, sale a 150
                    if (!close) armed = true;
                    SetNear(close && armed);
                    if (!down && stT > 0.05)
                    {
                        if (overBar) { GoHome(); return; } // lo sueltas sobre la barra de escribir: vuelve a la banda
                        vx = Math.Max(-1600, Math.Min(1600, curVx));
                        vy = Math.Max(-1400, Math.Min(1400, curVy));
                        Go(S.Fall);
                    }
                    break;
                }
            case S.Fall:
                {
                    double prevY = y;
                    vy += 2600 * dt * P / 4.0;
                    x += vx * dt;
                    y += vy * dt;
                    tilt += (Math.Max(-20, Math.Min(20, vx * 0.02)) - tilt) * Math.Min(1, dt * 6);
                    // cae encima de la barra de escribir: entra en la banda
                    if (thrown && armed && hasZone && vy > 0 && zone.Contains((float)x, (float)(y - 4 * P))) { GoHome(); return; }
                    // cerca, o a punto de entrar: se simula su caída y, si va a pasar por la barra, se avisa ya (la
                    // banda necesita unos 0,35 s para abrirse: tiene que estar abierta cuando llegue)
                    bool closeF = hasZone && (Inflate(zone, (nearNow ? 170 : 110) * DS).Contains((float)x, (float)y) || WillEnter(zone));
                    if (!closeF) armed = true;
                    SetNear(closeF && armed && thrown);
                    if (x < a.Left + half) { hard = Math.Max(hard, Math.Abs(vx)); x = a.Left + half; vx = Math.Abs(vx) * 0.5; }
                    if (x > a.Right - half) { hard = Math.Max(hard, Math.Abs(vx)); x = a.Right - half; vx = -Math.Abs(vx) * 0.5; }
                    double floor = FloorAt(x, prevY);
                    if (y >= floor)
                    {
                        y = floor;
                        hard = Math.Max(hard, vy);
                        if (vy > 700 && !bounced) { bounced = true; vy = -vy * 0.32; vx *= 0.7; }
                        else { vx = 0; vy = 0; Go(S.Land); }
                    }
                    break;
                }
            case S.Walk:
                {
                    double sp = 52 * P / 4.0;
                    double d = walkTo - x;
                    // arranca y frena con suavidad
                    double ease = Math.Min(1, Math.Min(stT * 3, Math.Abs(d) / (12.0 * P)));
                    x += Math.Sign(d) * Math.Min(Math.Abs(d), sp * Math.Max(0.15, ease) * dt);
                    double floor = FloorAt(x, y);
                    if (floor > y + 3) { vx = Math.Sign(d) * sp; vy = 0; Go(S.Fall); break; } // se acabó el techo: cae
                    y = floor;
                    if (Math.Abs(d) < 0.5)
                    {
                        // llegó a una pared: a veces trepa
                        bool atWall = x <= a.Left + half + 1 || x >= a.Right - half - 1;
                        if (atWall && Math.Abs(floor - a.Bottom) < 2 && rnd.NextDouble() < 0.75)
                        {
                            wall = x < a.Left + a.Width / 2 ? -1 : 1;
                            x = wall < 0 ? a.Left + 7 * P : a.Right - 7 * P;
                            Go(S.Climb);
                        }
                        else Decide();
                    }
                    break;
                }
            case S.Climb:
                {
                    // sube a tirones, mano tras mano: mientras una mano se estira el cuerpo espera; cuando tira, sube
                    int n; double reach, pull;
                    ClimbPhase(out n, out reach, out pull);
                    y = climbY0 - (n + pull) * CLIMB_STEP * P;
                    x = wall < 0 ? a.Left + 7 * P : a.Right - 7 * P;
                    double headTop = y - (GH + 1) * P;
                    if (headTop <= a.Top + 2 * P)
                    {
                        y = a.Top + (GH + 3) * P;
                        if (rnd.NextDouble() < 0.7) { hangLeft = 120 + rnd.NextDouble() * Math.Max(100, a.Width - 400); face = -wall; Go(S.Hang); }
                        else { vx = -wall * 160; vy = -80; Go(S.Fall); }
                    }
                    else if (rnd.NextDouble() < dt * 0.25) Go(S.Cling); // se para a descansar (y te mira)
                    break;
                }
            case S.Alert:
                // "¡!": se queda agarrado un instante y luego salta de la pared (o se suelta del techo)
                if (alertFrom == S.Hang) y = a.Top + (GH + 3) * P;
                else x = wall < 0 ? a.Left + 7 * P : a.Right - 7 * P;
                if (stT >= 0.5)
                {
                    if (alertFrom == S.Hang) { vx = face * 50; vy = -60; }
                    else { face = -wall; vx = -wall * 260; vy = -340; }
                    Go(S.Fall); // al aterrizar, Calm() lo pone a trabajar con Claude
                }
                break;
            case S.Cling:
                x = wall < 0 ? a.Left + 7 * P : a.Right - 7 * P;
                if (stT >= holdFor)
                {
                    if (rnd.NextDouble() < 0.82) { st = S.Climb; stT = 0; climbY0 = y; }
                    else { vx = -wall * 220; vy = -260; Go(S.Fall); } // salta de la pared
                }
                break;
            case S.Hang:
                {
                    // colgado del borde de arriba: avanza mano tras mano, balanceándose
                    double ph = (stT / 0.7) % 1.0;
                    double pull = Math.Pow(Math.Max(0, Math.Sin(ph * 2 * Math.PI * 2)), 2);
                    double step = (6 + 40 * pull) * P / 4.0 * dt * 3.2;
                    x += face * step;
                    hangLeft -= step;
                    y = a.Top + (GH + 3) * P;
                    tilt = Math.Sin(stT * 2 * Math.PI / 1.4) * 7 * -face;
                    bool atWall = x <= a.Left + half || x >= a.Right - half;
                    if (hangLeft <= 0 || atWall) { x = Math.Max(a.Left + half, Math.Min(a.Right - half, x)); vx = face * 60; vy = 0; Go(S.Fall); }
                    break;
                }
            case S.Peek:
                {
                    // sube desde abajo, avisa ~5 s y vuelve a esconderse
                    double rise = 0.45, stay = 5.6, sink = 0.4;
                    double k;
                    if (stT < rise) k = 1 - Math.Pow(1 - stT / rise, 3);
                    else if (stT < stay) k = 1;
                    else k = Math.Max(0, 1 - Math.Pow((stT - stay) / sink, 2));
                    y = peekBase + (1 - k) * 13 * P;
                    if (stT >= stay + sink) { Go(S.Hidden); return; }
                    break;
                }
            case S.Chase:
                // Clawd se mueve con la simulación (ApplyStory); aquí solo se acaba la historia
                y += (FloorAt(x, y) - y) * Math.Min(1, dt * 20);
                if (stT >= holdFor) Go(S.Idle);
                break;
            default:
                {
                    double floor = FloorAt(x, y);
                    if (floor > y + 3 && st != S.Announce) { vx = 0; vy = 0; Go(S.Fall); break; } // la ventana se movió
                    y += (floor - y) * Math.Min(1, dt * 20);
                    if (st == S.Idle && t - lastMoveT > 75) { Go(S.Sleep); break; }
                    if (st == S.Sleep && t - lastMoveT < 0.5)
                    {
                        double ddx = c.X - x, ddy = c.Y - (y - 6 * P);
                        if (ddx * ddx + ddy * ddy < 260 * 260) Go(S.Idle); // lo despiertas acercando el ratón
                    }
                    if (st == S.Land && stT >= holdFor) { if (hard > 900) Go(S.Dizzy); else Go(Calm()); break; }
                    if (holdFor > 0 && stT >= holdFor) Decide();
                    break;
                }
        }
        // trepando: de cara a la pared e inclinado hacia ella; mirando lo que escribes: ladea la cabeza hacia el texto
        bool onWall = st == S.Climb || st == S.Cling || (st == S.Alert && alertFrom != S.Hang);
        if (onWall) face = wall;
        double lean = onWall ? 0 : st == S.Curious ? CuriousLean() : 0; // trepando: derecho, solo se mueven las manitas
        if (st != S.Held && st != S.Fall && st != S.Hang) tilt += (lean - tilt) * Math.Min(1, dt * 10);
        if (st != S.Held && st != S.Fall) SetNear(false);

        // mirada: sigue al ratón con suavidad si anda cerca (y se gira si lo tiene detrás y está quieto)
        double ex = c.X - x, ey = c.Y - (y - 6.5 * P);
        double tgx = 0, tgy = 0;
        bool near = ex * ex + ey * ey < 520.0 * 520.0;
        if (near && st != S.Sleep)
        {
            tgx = Math.Max(-1, Math.Min(1, ex / 220.0)) * face;
            tgy = Math.Max(-1, Math.Min(1, ey / 160.0));
            if ((st == S.Idle || st == S.Sit) && Math.Abs(ex) > 90 && Math.Sign(ex) != face) face = -face;
        }
        if (st == S.Held) { tgx = 0; tgy = -0.6; }
        if (st == S.Climb || st == S.Hang) { tgx = 0; tgy = -0.9; }
        if (st == S.Peek || st == S.Announce) { tgx = 0.3 * face; tgy = -0.2; }
        if (st == S.Work) { tgx = webMood ? Math.Sin(t * 2.2) * 0.6 : 0.15 + Math.Sin(t * 1.3) * 0.15; tgy = 0.75; } // mira su pantalla o su libro
        if (st == S.Asking) { tgx = 0; tgy = -0.1; } // te mira a ti
        if (st == S.Curious && t - lastTypeAt < 2.5)
        {
            double kx = caretAt.X - x, ky = caretAt.Y - (y - 6.5 * P);
            if (Math.Abs(kx) > 60) face = kx < 0 ? -1 : 1;
            tgx = Math.Max(-1, Math.Min(1, kx / 200.0)) * face;
            tgy = Math.Max(-1, Math.Min(1, ky / 120.0));
        }
        gx += (tgx - gx) * Math.Min(1, dt * 9);
        gy += (tgy - gy) * Math.Min(1, dt * 9);
        fs += (face - fs) * Math.Min(1, dt * 16);
        if (IsStory(st)) ApplyStory();

        Place();
        Invalidate();
    }

    /** ¿Va a pasar por la zona de la barra en el próximo segundo, con la caída que lleva (la misma física que Step)? */
    bool WillEnter(RectangleF zone)
    {
        double px = x, py = y, pvx = vx, pvy = vy;
        const double dt = 0.03;
        Rectangle a = Area();
        double half = (GW / 2.0 + 1) * P;
        for (int i = 0; i < 40; i++)
        {
            pvy += 2600 * dt * P / 4.0;
            px += pvx * dt;
            py += pvy * dt;
            if (px < a.Left + half) { px = a.Left + half; pvx = Math.Abs(pvx) * 0.5; }
            else if (px > a.Right - half) { px = a.Right - half; pvx = -Math.Abs(pvx) * 0.5; }
            if (pvy > 0 && zone.Contains((float)px, (float)(py - 4 * P))) return true;
            if (py >= FloorAt(px, py - 1)) return false; // aterriza antes de llegar
        }
        return false;
    }

    /** Un color que pulsa entre el fondo y su color (0,25 -> 1 -> 0,25 cada 0,9 s), sin transparencia: la ventana no la tiene. */
    static Color Pulse(Color c, Color bg, double t, double begin)
    {
        double ph = (((t - begin) % 0.9) + 0.9) % 0.9 / 0.9;
        double a = 0.25 + 0.75 * (1 - Math.Abs(2 * ph - 1));
        return Color.FromArgb((int)(bg.R + (c.R - bg.R) * a), (int)(bg.G + (c.G - bg.G) * a), (int)(bg.B + (c.B - bg.B) * a));
    }

    static RectangleF Inflate(RectangleF r, double by)
    {
        RectangleF o = r;
        o.Inflate((float)by, (float)by);
        return o;
    }

    void GoHome()
    {
        Say("home " + BandFraction());
        Go(S.Hidden);
    }

    void Place()
    {
        int left = (int)Math.Round(x) - (MX + 7) * P;
        int top = (int)Math.Round(y) - (MT + GH) * P;
        if (left != Left || top != Top) Location = new Point(left, top);
    }

    // ── historias: avión de papel, mapa, cascos y mariposa ──────────────────

    static bool IsStory(S s) { return s == S.Plane || s == S.Map || s == S.Music || s == S.Chase; }

    static Color Mix(Color a, Color b, double k)
    {
        k = Math.Max(0, Math.Min(1, k));
        return Color.FromArgb((int)(a.R + (b.R - a.R) * k), (int)(a.G + (b.G - a.G) * k), (int)(a.B + (b.B - a.B) * k));
    }

    static readonly int[][] Q_CELLS = { new[] { 0, 0 }, new[] { 1, 0 }, new[] { 2, 0 }, new[] { 2, 1 }, new[] { 1, 2 }, new[] { 1, 4 } };
    static readonly int[][] X_CELLS = { new[] { 1, 0 }, new[] { 1, 1 }, new[] { 1, 2 }, new[] { 1, 4 } };
    static readonly int[][] NOTE_CELLS = { new[] { 1, 0 }, new[] { 2, 0 }, new[] { 1, 1 }, new[] { 3, 1 }, new[] { 1, 2 }, new[] { 0, 3 }, new[] { 1, 3 }, new[] { 0, 4 }, new[] { 1, 4 } };

    void StartStory(S s)
    {
        storyX0 = x;
        bPhase = 0; lastStoryT = 0;
        spose = null; planeF = null; mapF = null; musicF = null; chaseF = null;
        holdFor = s == S.Plane ? Story.PlaneT : s == S.Map ? Story.MapT : s == S.Music ? Story.MusicT : Story.ChaseT;
        if (s == S.Plane || s == S.Chase) face = storyDir; else storyDir = face;
        if (s == S.Chase) chaseSim = Story.Simulate();
    }

    /** De vez en cuando, cuenta una historia (si hay sitio para ella). */
    bool TryStory()
    {
        Rectangle a = Area();
        int pick = rnd.Next(4);
        S s = pick == 0 ? S.Plane : pick == 1 ? S.Map : pick == 2 ? S.Music : S.Chase;
        if (s == S.Plane || s == S.Chase)
        {
            double need = (s == S.Plane ? 40 : 30) * P; // el avión vuela lejos; la mariposa se lo lleva a pasear
            bool right = a.Right - x >= need, left = x - a.Left >= need;
            if (!right && !left) return false;
            RECT cr;
            if (s == S.Chase && Claude(out cr) && Math.Abs(y - cr.Top) < 3) return false; // sobre la ventana de Claude no persigue (se caería por el borde)
            storyDir = right && left ? (rnd.NextDouble() < 0.5 ? 1 : -1) : right ? 1 : -1;
        }
        Go(s);
        return true;
    }

    void HideProp()
    {
        if (prop != null && !prop.IsDisposed) prop.Hide();
    }

    /** Un fotograma de la historia: la postura de Clawd y dónde van el avión o la mariposa. */
    void ApplyStory()
    {
        double t = stT;
        propShow = false;
        if (st == S.Plane)
        {
            planeF = Story.Plane(t); spose = planeF.P;
            propShow = planeF.Vis > 0.04;
            propCx = x + storyDir * (planeF.X - 7) * P;
            propCy = y + (planeF.Y - 11) * P;
        }
        else if (st == S.Map) { mapF = Story.Map(t); spose = mapF.P; }
        else if (st == S.Music) { musicF = Story.Music(t); spose = musicF.P; }
        else if (st == S.Chase)
        {
            if (chaseSim == null) chaseSim = Story.Simulate();
            int i = Story.SimIndex(t);
            Rectangle a = Area();
            double half = (GW / 2.0 + 1) * P;
            x = Math.Max(a.Left + half, Math.Min(a.Right - half, storyX0 + storyDir * chaseSim.Off[i] * P));
            face = chaseSim.Fd[i] * storyDir > 0 ? 1 : -1;
            chaseF = Story.Chase(t, chaseSim.Off[i], chaseSim.V[i], chaseSim.Step[i], fs < 0 ? -1 : 1);
            spose = chaseF.P;
            bPhase += Story.BflyFreq(t) * Math.Max(0, t - lastStoryT);
            lastStoryT = t;
            propShow = chaseF.BflyVis;
            propCx = storyX0 + storyDir * chaseF.Bx * P;
            propCy = y + (chaseF.By + (chaseF.Landed ? 0 : 0.35 * Math.Sin(t * 9))) * P;
        }
        if (snapping) return;
        if (propShow)
        {
            if (prop == null || prop.IsDisposed) { prop = new PropWin(26 * P, KEY); prop.Painter = PaintProp; }
            prop.Location = new Point((int)Math.Round(propCx) - prop.Width / 2, (int)Math.Round(propCy) - prop.Height / 2);
            if (!prop.Visible) { prop.Show(); SetWindowPos(prop.Handle, TOPMOST, prop.Left, prop.Top, 0, 0, SWP_NOACTIVATE | SWP_NOSIZE | SWP_SHOWWINDOW); }
            prop.Invalidate();
            prop.Update();
        }
        else if (prop != null && !prop.IsDisposed && prop.Visible) prop.Hide();
    }

    /** Un símbolo de píxeles (?, !, nota) centrado en (cx, cy) de su casilla y puesto en (tx, ty) con su escala. */
    void Glyph(int[][] cells, Color c, double cx, double cy, double tx, double ty, double sc)
    {
        GraphicsState g = G.Save();
        G.TranslateTransform((float)tx, (float)ty);
        G.ScaleTransform((float)sc, (float)sc);
        G.TranslateTransform((float)-cx, (float)-cy);
        foreach (int[] k in cells) R(k[0], k[1], 1, 1, c);
        G.Restore(g);
    }

    void PaintMap(Story.MapFrame m)
    {
        if (m.MapOp > 0.05)
        {
            GraphicsState g = G.Save();
            G.TranslateTransform(7, (float)(7.9 + m.Drop));
            G.ScaleTransform((float)m.Sx, (float)(1 - m.Drop * 0.12));
            G.RotateTransform((float)m.RotM);
            G.TranslateTransform(-4.5f, -2.2f);
            R(0, 0, 9, 4.4, PAGE); R(0, 4, 9, 0.4, PAGEDIM); R(3, 0, 0.3, 4.4, PAGEDIM); R(6, 0, 0.3, 4.4, PAGEDIM);
            R(0.5, 0.5, 1.5, 1, GREEN); R(1.1, 1.3, 1.2, 0.8, GREEN); R(6.6, 2.6, 1.6, 1, GREEN);
            double[][] river = { new[] { 3.4, 0.4 }, new[] { 4, 1.2 }, new[] { 4.4, 2 }, new[] { 4.8, 2.8 } };
            foreach (double[] r in river) R(r[0], r[1], 1, 0.8, BLUE);
            double[][] route = { new[] { 0.8, 3.1 }, new[] { 1.9, 2.7 }, new[] { 2.2, 3.3 }, new[] { 5.5, 1.8 }, new[] { 6.4, 1.3 } };
            foreach (double[] r in route) R(r[0], r[1], 0.5, 0.5, RED);
            double[][] cross = { new[] { 7, 0.5 }, new[] { 8, 0.5 }, new[] { 7.5, 1 }, new[] { 7, 1.5 }, new[] { 8, 1.5 } };
            foreach (double[] r in cross) R(r[0], r[1], 0.6, 0.5, RED);
            G.Restore(g);
        }
        if (m.Hv > 0) { R(7 - m.Hx - 0.65, 7.3 + m.Drop, 1.3, 1.3, BODY); R(7 + m.Hx - 0.65, 7.3 + m.Drop, 1.3, 1.3, BODY); } // las manos sujetando el mapa
        // no hay transparencia en esta ventana: lo que se desvanece se encoge
        if (m.QOp > 0.15) Glyph(Q_CELLS, WHITE, 1.5, 2.5, 7.5, -0.1 + m.QBob, m.QS * Math.Min(1, m.QOp * 2));
        if (m.EOp > 0.15) Glyph(X_CELLS, YELLOW, 1.5, 2.5, 7.5, -0.1, m.ES * Math.Min(1, m.EOp * 2));
    }

    void PaintPhones(Story.MusicFrame m)
    {
        if (m.HpOp < 0.25) return;
        GraphicsState g = G.Save();
        G.TranslateTransform(0, (float)m.Hy);
        R(4, 1.4, 6, 1, WHITE); R(3, 2.2, 1, 1.4, WHITE); R(10, 2.2, 1, 1.4, WHITE);
        foreach (double cx in new double[] { 1.2, 10.8 }) { R(cx, 3.6, 2, 3.8, CUP); R(cx + 0.35, 4.2, 1.3, 2.6, CUP2); }
        Color led = Mix(CUP2, BLUE, m.Led);
        R(1.7, 4.5, 0.6, 0.6, led); R(11.7, 4.5, 0.6, 0.6, led);
        G.Restore(g);
    }

    /** Clawd en plena historia: el mismo cuerpo de siempre con la postura de la línea de tiempo. */
    void PaintStory()
    {
        StoryPose p = spose;
        if (p == null) return;
        GraphicsState saved = G.Save();
        G.TranslateTransform((MX + 7) * P, (float)((MT + 11) * P + p.Dy * P));
        G.RotateTransform((float)p.Rot);
        G.ScaleTransform((float)(p.Sx * fs), (float)p.Sy);
        G.TranslateTransform(-7 * P, -11 * P);
        G.ScaleTransform(P, P);
        R(0, p.AL[0], 2, p.AL[1], BODY);
        R(12, p.AR[0], p.ArW, p.AR[1], BODY);
        R(2, 3, 10, 6, BODY);
        R(2, 8, 10, 1, SHADE);
        int[] lx = { 3, 5, 8, 10 };
        for (int i = 0; i < 4; i++) R(lx[i], 9, 1, p.Legs[i], SHADE);
        double h = p.Eh * (1 - p.Blink) + 0.4 * p.Blink, ox = p.Gx * 0.9, oy = p.Gy * 0.75;
        if (p.Happy)
        {
            for (int k = 0; k < 2; k++) { double e0 = (k == 0 ? 3 : 8) + ox; R(e0, 5.5 + oy, 1, 1, DARK); R(e0 + 1, 4.5 + oy, 1, 1, DARK); R(e0 + 2, 5.5 + oy, 1, 1, DARK); }
        }
        else { R(4 + ox, p.Ecy - h / 2 + oy, 1, h, DARK); R(9 + ox, p.Ecy - h / 2 + oy, 1, h, DARK); }
        if (st == S.Map && mapF != null) PaintMap(mapF);
        if (st == S.Music && musicF != null) PaintPhones(musicF);
        if (st == S.Chase && chaseF != null && chaseF.ExOp > 0.15) Glyph(X_CELLS, YELLOW, 1.5, 2.5, 7.7, -0.1, chaseF.ExS * Math.Min(1, chaseF.ExOp * 2));
        G.Restore(saved);
        if (st == S.Music)
        {
            // las notas suben desde un auricular, de lado a lado (fuera del giro del cuerpo)
            GraphicsState s2 = G.Save();
            G.TranslateTransform(MX * P, MT * P);
            G.ScaleTransform(P, P);
            G.TranslateTransform(7, 0);
            G.ScaleTransform((float)fs, 1);
            G.TranslateTransform(-7, 0);
            Color[] nc = { PINK, BLUE, GREEN, YELLOW };
            for (int k = 0; k < 6; k++)
            {
                double nx, ny, nsc, nop;
                if (!Story.Note(k, stT, out nx, out ny, out nsc, out nop) || nop < 0.15) continue;
                Glyph(NOTE_CELLS, nc[k % 4], 2, 2.5, nx + 2, ny + 2.5, nsc * Math.Min(1, nop * 2));
            }
            G.Restore(s2);
        }
    }

    /** La ventanita que se pasea: el avión (con su estela) o la mariposa. */
    void PaintProp(Graphics g)
    {
        G = g;
        G.Clear(KEY);
        G.SmoothingMode = SmoothingMode.None;
        G.PixelOffsetMode = PixelOffsetMode.Half;
        G.InterpolationMode = InterpolationMode.NearestNeighbor;
        float c = 13f * P;
        if (st == S.Plane && planeF != null)
        {
            for (int i = 0; i < 3; i++)
            {
                double[] tr = planeF.Trail[i];
                if (tr[2] < 0.05) continue;
                double dx = (tr[0] - planeF.X) * storyDir, dy = tr[1] - planeF.Y, sz = 1.2 * Math.Min(1, tr[2] * 2.6);
                R(c + dx * P - sz * P / 2, c + dy * P - sz * P / 2, sz * P, sz * P, WHITE);
            }
            GraphicsState s = G.Save();
            G.TranslateTransform(c, c);
            G.ScaleTransform(storyDir, 1);
            G.RotateTransform((float)planeF.Rot);
            float k = (float)(P * planeF.Sc * Math.Min(1, planeF.Vis * 1.5));
            G.ScaleTransform(k, k);
            G.TranslateTransform(-3.5f, -2.5f);
            R(0, 0, 2, 1, WHITE); R(0, 1, 4, 1, WHITE); R(0, 2, 7, 1, FOLD2); R(0, 3, 4, 1, FOLD); R(0, 4, 2, 1, FOLD);
            G.Restore(s);
        }
        else if (st == S.Chase && chaseF != null)
        {
            double swx = 0.2 + 0.8 * (0.5 + 0.5 * Math.Cos(bPhase * 2 * Math.PI));
            GraphicsState s = G.Save();
            G.TranslateTransform(c, c);
            G.ScaleTransform(storyDir, 1);
            G.RotateTransform((float)chaseF.Tilt);
            G.ScaleTransform(P, P);
            for (int w = 0; w < 2; w++)
            {
                GraphicsState g2 = G.Save();
                G.ScaleTransform((float)(w == 0 ? swx : -swx), 1);
                R(0.5, -2.4, 2.8, 1.5, BLUE); R(0.5, -0.9, 2.1, 1, BLUE); R(0.5, 0.1, 1.5, 1.5, BLUE2); R(2.1, -2, 0.8, 0.6, WHITE);
                G.Restore(g2);
            }
            R(-0.5, -1.6, 1, 3.4, DARK); R(-1, -2.8, 0.35, 1.3, DARK); R(0.65, -2.8, 0.35, 1.3, DARK);
            G.Restore(s);
        }
    }

    /** Prueba sin pantalla: una historia en un instante, con su avión o su mariposa, en un PNG (fondo gris). */
    static void SnapStory(Pet p, S s, double t, string name)
    {
        double fx = 220, fy = 250;
        p.snapping = true;
        p.x = fx; p.y = fy; p.storyDir = 1; p.fs = 1;
        p.StartStory(s);
        p.st = s; p.stT = t; p.holdFor = 99;
        p.bPhase = 0;
        for (double q = 0; q < t; q += 0.01) p.bPhase += Story.BflyFreq(q) * 0.01;
        p.lastStoryT = t;
        p.ApplyStory();
        using (Bitmap o = new Bitmap(1000, 320))
        using (Graphics og = Graphics.FromImage(o))
        {
            og.Clear(Color.FromArgb(60, 60, 58));
            using (Bitmap b = new Bitmap(p.ClientSize.Width, p.ClientSize.Height))
            using (Graphics g = Graphics.FromImage(b))
            {
                p.PaintCore(new PaintEventArgs(g, new Rectangle(Point.Empty, b.Size)));
                b.MakeTransparent(KEY);
                og.DrawImage(b, (int)Math.Round(p.x) - (MX + 7) * p.P, (int)Math.Round(p.y) - (MT + 11) * p.P);
            }
            if (p.propShow)
            {
                int w = 26 * p.P;
                using (Bitmap b2 = new Bitmap(w, w))
                using (Graphics g2 = Graphics.FromImage(b2))
                {
                    p.PaintProp(g2);
                    b2.MakeTransparent(KEY);
                    og.DrawImage(b2, (int)Math.Round(p.propCx) - w / 2, (int)Math.Round(p.propCy) - w / 2);
                }
            }
            o.Save(Path.Combine(snapDir, name + ".png"));
        }
    }

    static string snapDir = ".";

    static void SnapStories(string dir)
    {
        snapDir = dir;
        Pet p = new Pet(null);
        double[] tp = { 1.2, 2.45, 3.3, 4.6, 6.6 }, tm = { 1.4, 2.6, 4.3, 6.0, 7.0 }, tu = { 0.9, 2.6, 3.9, 5.5, 7.4 }, tc = { 1.5, 3.6, 5.9, 9.0, 12.0, 14.3 };
        for (int i = 0; i < tp.Length; i++) SnapStory(p, S.Plane, tp[i], "Plane-" + i);
        for (int i = 0; i < tm.Length; i++) SnapStory(p, S.Map, tm[i], "Map-" + i);
        for (int i = 0; i < tu.Length; i++) SnapStory(p, S.Music, tu[i], "Music-" + i);
        for (int i = 0; i < tc.Length; i++) SnapStory(p, S.Chase, tc[i], "Chase-" + i);
    }

    /** Prueba sin pantalla: pinta cada estado en un PNG (fondo gris) y termina. */
    public static void Snap(string dir)
    {
        Pet p = new Pet(null);
        S[] all = { S.Idle, S.Walk, S.Held, S.Fall, S.Land, S.Sit, S.Sleep, S.Wave, S.Petting, S.Dizzy, S.Climb, S.Cling, S.Hang, S.Announce, S.Work, S.Asking, S.Curious };
        foreach (S s in all) SnapOne(p, s, dir, s.ToString());
        SnapOne(p, S.Work, dir, "Work-web");
        p.alertFrom = S.Climb; SnapOne(p, S.Alert, dir, "Alert");
        p.sparkAt = p.clock.Elapsed.TotalSeconds - 0.3; SnapOne(p, S.Work, dir, "Work-stars"); p.sparkAt = -9;
        for (int i = 0; i < 8; i++) { p.snapT = i * CLIMB_HALF / 4; SnapOne(p, S.Climb, dir, "Climb-" + i); }
        p.snapT = -1;
        SnapOne(p, S.Idle, dir, "Usage");
        p.askLong = true; SnapOne(p, S.Asking, dir, "Asking-largo"); p.askLong = false;
        SnapStories(dir);
    }

    static void SnapOne(Pet p, S s, string dir, string name)
    {
        p.asks.Clear(); p.working = s == S.Work; p.webMood = name == "Work-web";
        if (s == S.Asking) { Ask a = new Ask(); a.Id = "1"; a.Tool = "Bash"; a.Summary = p.askLong ? "git add -A && git commit -m 'actualizar todo' && git push --force origin main && rm -rf build dist node_modules && npm install" : "npm install --save-dev typescript"; a.File = ""; p.asks.Add(a); }
        if (name == "Usage")
        {
            // la ventanita de uso, a su tamaño normal y agrandada (como al acercar el ratón)
            string[] rows = { "Sesión|37|2 h 14 min", "Semana|91|3 d 4 h" };
            foreach (double k in new double[] { 1.0, UsagePanel.ZOOM })
            {
                UsagePanel u = new UsagePanel(p.DS, rows);
                u.SetScale(k);
                using (Bitmap ub = new Bitmap(u.Width, u.Height))
                {
                    u.DrawToBitmap(ub, new Rectangle(Point.Empty, u.Size));
                    ub.Save(Path.Combine(dir, k == 1.0 ? "UsagePanel.png" : "UsagePanel-zoom.png"));
                }
                u.Dispose();
            }
            return;
        }
        if (s == S.Curious) { p.lastTypeAt = p.clock.Elapsed.TotalSeconds; p.x = 500; p.y = 500; p.caretAt = new Point(560, 380); }
        p.st = s; p.stT = p.snapT >= 0 && s == S.Climb ? p.snapT : s == S.Climb || s == S.Hang ? 0.2 : 0.1; p.holdFor = 0.38; p.tilt = s == S.Held ? 25 : s == S.Hang ? 6 : 0;
        p.gx = 0.6; p.gy = s == S.Climb || s == S.Hang ? -0.9 : 0.4; p.wall = 1; p.face = 1; p.fs = 1;
        using (Bitmap b = new Bitmap(p.ClientSize.Width, p.ClientSize.Height))
        using (Graphics g = Graphics.FromImage(b))
        {
            p.PaintCore(new PaintEventArgs(g, new Rectangle(Point.Empty, b.Size)));
            b.MakeTransparent(KEY);
            using (Bitmap o = new Bitmap(b.Width, b.Height))
            using (Graphics og = Graphics.FromImage(o))
            {
                og.Clear(Color.FromArgb(60, 60, 58));
                og.DrawImage(b, 0, 0);
                o.Save(Path.Combine(dir, name + ".png"));
            }
        }
    }

    // ── dibujo ───────────────────────────────────────────────────────────────

    /**
     * Trepando: a qué altura está cada mano (píxeles del sprite). Mano tras mano: mientras una sube a buscar el
     * siguiente agarre, la otra está agarrada y tira del cuerpo hacia arriba. Descansando, las dos quietas.
     */
    const double CLIMB_HALF = 0.42; // segundos por mano (estirarse + tirar)
    const double CLIMB_REACH = 0.42; // parte de cada vuelta en que la mano se estira (el cuerpo espera)
    const double CLIMB_STEP = 4; // cuánto sube el cuerpo con cada tirón (píxeles del sprite)
    const double HAND_TOP = 0.4, HAND_LOW = 5.2; // la mano arriba (por encima de la cabeza) / abajo, junto al cuerpo

    static double Ease(double k) { k = Math.Max(0, Math.Min(1, k)); return k * k * (3 - 2 * k); }

    /** En qué vuelta va (n), cuánto se ha estirado la mano de esta vuelta y cuánto ha tirado (0..1). */
    void ClimbPhase(out int n, out double reach, out double pull)
    {
        n = (int)(stT / CLIMB_HALF);
        double f = (stT % CLIMB_HALF) / CLIMB_HALF;
        reach = Ease(f / CLIMB_REACH);
        pull = f < CLIMB_REACH ? 0 : Ease((f - CLIMB_REACH) / (1 - CLIMB_REACH));
    }

    /**
     * Trepando: la altura de cada manita (píxeles del sprite). Mano tras mano: la de esta vuelta sube por encima de
     * la cabeza y luego tira (agarrada a la pared, baja tanto como sube el cuerpo); la otra, agarrada mientras tanto,
     * se suelta y baja. Solo se mueven las manitas: nada más interviene. Descansando, las dos quietas.
     */
    void ClimbPose(out double handFront, out double handBack)
    {
        if (st == S.Cling || st == S.Alert) { handFront = HAND_TOP + 0.6; handBack = HAND_LOW - 0.6; return; }
        int n; double reach, pull;
        ClimbPhase(out n, out reach, out pull);
        double grip = HAND_TOP + CLIMB_STEP * pull; // la mano de esta vuelta: arriba, y al tirar se queda agarrada
        double active = pull > 0 ? grip : HAND_LOW + (HAND_TOP - HAND_LOW) * reach;
        double holding = pull > 0 ? (HAND_TOP + CLIMB_STEP) + (HAND_LOW - HAND_TOP - CLIMB_STEP) * pull : HAND_TOP + CLIMB_STEP;
        bool frontTurn = n % 2 == 0;
        handFront = frontTurn ? active : holding;
        handBack = frontTurn ? holding : active;
    }

    /** Mirando lo que escribes: ladea la cabeza hacia el texto (grados); si paras de escribir, se endereza. */
    double CuriousLean()
    {
        if (clock.Elapsed.TotalSeconds - lastTypeAt > 2.5) return 0;
        double dx = caretAt.X - x, ad = Math.Abs(dx);
        if (ad < 50 * DS) return 0; // justo debajo del cursor: derecho, mirando arriba (antes titubeaba de un lado a otro)
        return Math.Sign(dx) * Math.Min(5, (ad - 50 * DS) / (40 * DS) * 5);
    }

    Graphics G;
    readonly System.Collections.Generic.Dictionary<int, SolidBrush> brushes = new System.Collections.Generic.Dictionary<int, SolidBrush>();

    void R(double rx, double ry, double w, double h, Color c)
    {
        SolidBrush b;
        if (!brushes.TryGetValue(c.ToArgb(), out b)) { b = new SolidBrush(c); brushes[c.ToArgb()] = b; }
        G.FillRectangle(b, (float)rx, (float)ry, (float)w, (float)h);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        try { PaintCore(e); } catch (Exception ex) { Dbg(ex); }
    }

    /** Con CLAWD_DEBUG=1 apunta en el temporal los fallos que, si no, se tragan en silencio (para diagnosticar). */
    internal static void Dbg(Exception ex)
    {
        if (Environment.GetEnvironmentVariable("CLAWD_DEBUG") != "1") return;
        try { File.AppendAllText(Path.Combine(Path.GetTempPath(), "clawd-pet-error.log"), DateTime.Now.ToString("HH:mm:ss.fff") + " " + ex + "\n"); } catch { }
    }

    void PaintCore(PaintEventArgs e)
    {
        G = e.Graphics;
        G.Clear(KEY);
        if (st == S.Hidden) return;
        G.SmoothingMode = SmoothingMode.None;
        G.PixelOffsetMode = PixelOffsetMode.Half;
        G.InterpolationMode = InterpolationMode.NearestNeighbor;
        if (IsStory(st)) { PaintStory(); return; }
        double t = clock.Elapsed.TotalSeconds;
        bool climbing = st == S.Climb || st == S.Cling || (st == S.Alert && alertFrom != S.Hang);
        bool hanging = st == S.Hang || (st == S.Alert && alertFrom == S.Hang);

        // aplastar y estirar (pivote: los pies; colgando: la cabeza)
        double sx = 1, sy = 1;
        if (st == S.Land) { double k = 1 - stT / holdFor; sx = 1 + 0.22 * k; sy = 1 - 0.26 * k; }
        else if (st == S.Fall) { sx = 0.94; sy = 1.08; }
        else if (st == S.Held || hanging) { sx = 0.96; sy = 1.06; }
        else if (st == S.Sit || st == S.Work) { sx = 1.05; sy = 0.9; }
        else if (st == S.Asking) { double b = Math.Abs(Math.Sin(t * 5)) * 0.05; sx = 1 - b; sy = 1 + b; }
        else if (st == S.Alert) { double b = 0.08 * Math.Exp(-stT * 8); sx = 1 - b; sy = 1 + b; } // ¡sorpresa!
        else if (st == S.Curious) { double b = 0.06 * Math.Exp(-(t - lastTypeAt) * 9); sx = 1 - b; sy = 1 + b; } // un saltito con cada tecla
        else if (st == S.Sleep) { double b = Math.Sin(t * 2) * 0.02; sx = 1 + b; sy = 1 + b * 1.6; }
        else if (climbing) { sx = 1; sy = 1; } // trepando, el cuerpo no se estira ni se encoge: solo las manitas
        else { double b = Math.Sin(t * 2.2) * 0.012; sy = 1 + b; }

        bool fromHead = st == S.Held || hanging;
        float pivX = (MX + 7) * P, pivY = (MT + (fromHead ? 1.5f : 11f)) * P;
        double bob = st == S.Walk ? -Math.Abs(Math.Sin(t * 8.7)) * 0.45 : 0;
        if (st == S.Announce) bob = -Math.Abs(Math.Sin(t * 6)) * 2.2;

        GraphicsState saved = G.Save();
        G.TranslateTransform(pivX, pivY);
        G.RotateTransform((float)tilt);
        G.ScaleTransform((float)(sx * fs), (float)sy);
        G.TranslateTransform(-7 * P, -(fromHead ? 1.5f : 11f) * P);
        G.ScaleTransform(P, P);
        G.TranslateTransform(0, (float)bob);

        // brazos
        if (st == S.Work)
        {
            if (webMood) { R(0, 6.4, 2, 2, BODY); R(12, 6.4, 2, 2, BODY); } // sujeta el libro (las manos van encima)
            else { R(0, 7.4 - Math.Max(0, Math.Sin(t * 21)) * 0.5, 2, 1.8, BODY); R(12, 7.4 - Math.Max(0, Math.Sin(t * 21 + 2)) * 0.5, 2, 1.8, BODY); } // teclea
        }
        else if (st == S.Asking)
        {
            // levanta las manitas: "¡eh, mira!"
            R(0, 0.8 - Math.Abs(Math.Sin(t * 6)) * 1.2, 2, 4.2, BODY);
            R(12, 0.8 - Math.Abs(Math.Sin(t * 6 + 1.6)) * 1.2, 2, 4.2, BODY);
        }
        else if (st == S.Curious)
        {
            // curioso: una mano en la barbilla, la otra tranquila
            R(0, 5 + Math.Sin(t * 2.6) * 0.2, 2, 2, BODY);
            R(11.2, 5.4, 2, 1.8, BODY);
            R(10.6, 5.2, 1.4, 1.2, SHADE);
        }
        else if (hanging)
        {
            // colgado del borde de arriba: las dos manos arriba, avanzando una tras otra
            double ph = (stT / 0.7) % 1.0;
            double l = 0.5 + 0.5 * Math.Cos(ph * 2 * Math.PI);
            double reachL = -2.5 - l * 1.2, reachR = -2.5 - (1 - l) * 1.2;
            R(0, reachL, 2, 7 - reachL, BODY);
            R(12, reachR, 2, 7 - reachR, BODY);
            R(0, reachL, 2, 1, SHADE); // las manitas
            R(12, reachR, 2, 1, SHADE);
        }
        else if (climbing)
        {
            // trepando (la pared a su derecha, +x: la cara ya mira hacia ella): dos manitas cuadradas en la pared,
            // la de detrás un poco más afuera
            double hf, hb;
            ClimbPose(out hf, out hb);
            R(13.6, hb, 2, 2, BODY);
        }
        else if (st == S.Held || st == S.Fall) { R(0, 1.5 + Math.Sin(t * 18) * 0.6, 2, 3.5, BODY); R(12, 1.5 - Math.Sin(t * 18) * 0.6, 2, 3.5, BODY); }
        else if (st == S.Wave || st == S.Peek || st == S.Announce) { R(0, 5, 2, 2, BODY); R(12, 1.5 - Math.Abs(Math.Sin(t * 9)) * 1.1, 2, 3.5, BODY); }
        else if (st == S.Petting) { R(0, 1.5, 2, 3.5, BODY); R(12, 1.5, 2, 3.5, BODY); }
        else if (st == S.Sit || st == S.Sleep || st == S.Land) { R(0, 6.8, 2, 2, BODY); R(12, 6.8, 2, 2, BODY); }
        else if (st == S.Walk) { double s = Math.Sin(t * 8.7); R(0, 5 + s, 2, 2, BODY); R(12, 5 - s, 2, 2, BODY); }
        else { double s = Math.Sin(t * 2.6) * 0.2; R(0, 5 + s, 2, 2, BODY); R(12, 5 + s, 2, 2, BODY); }

        // cuerpo
        R(2, 3, 10, 6, BODY);
        R(2, 8, 10, 1, SHADE);

        if (climbing)
        {
            // la manita de delante (por encima del cuerpo)
            double hf, hb;
            ClimbPose(out hf, out hb);
            R(12, hf, 2, 2, BODY);
        }

        // patas
        int[] lx = { 3, 5, 8, 10 };
        for (int i = 0; i < 4; i++)
        {
            double h = 2;
            if (st == S.Walk) h = 1.65 + Math.Sin(t * 17.4 + (i % 2) * Math.PI) * 0.35;
            else if (st == S.Held || hanging) h = 2.0 + Math.Sin(t * 15 + (i % 2) * Math.PI) * 0.4;
            else if (st == S.Fall) h = 1;
            else if (st == S.Sit || st == S.Work) h = 1.7 + Math.Sin(t * 5.7 + (i % 2) * Math.PI) * 0.3;
            R(lx[i], 9, 1, h, SHADE);
        }

        // ojos
        double ox = gx * 0.9, oy = gy * 0.75;
        bool blink = t > blinkAt && t < blinkAt + 0.12;
        if (t > blinkAt + 0.12) blinkAt = t + 2.5 + rnd.NextDouble() * 3;
        if (st == S.Sleep) { R(3.5, 5.5, 2, 0.8, DARK); R(8.5, 5.5, 2, 0.8, DARK); }
        else if (st == S.Petting || st == S.Wave || st == S.Announce || st == S.Peek)
        {
            for (int k = 0; k < 2; k++) { double ex0 = k == 0 ? 3 : 8; R(ex0, 5.5, 1, 1, DARK); R(ex0 + 1, 4.5, 1, 1, DARK); R(ex0 + 2, 5.5, 1, 1, DARK); }
        }
        else if (st == S.Dizzy)
        {
            for (int k = 0; k < 2; k++) { double cx = k == 0 ? 4.5 : 9.5; R(cx - 1, 4.5, 1, 1, DARK); R(cx + 1, 4.5, 1, 1, DARK); R(cx, 5.5, 1, 1, DARK); R(cx - 1, 6.5, 1, 1, DARK); R(cx + 1, 6.5, 1, 1, DARK); }
        }
        else if (st == S.Alert) { R(3.5, 3.8, 2, 3.4, DARK); R(8.5, 3.8, 2, 3.4, DARK); R(4.2, 4.2, 0.7, 0.7, WHITE); R(9.2, 4.2, 0.7, 0.7, WHITE); }
        else if (climbing)
        {
            // de perfil: los ojos hacia la pared y arriba; descansando, te mira a ti (hacia fuera)
            double ex = st == S.Cling ? -0.6 : 1.4, ey = st == S.Cling ? 0 : -1.1;
            if (blink) { R(4 + ex, 5.3 + ey, 1, 0.5, DARK); R(8 + ex, 5.3 + ey, 1, 0.5, DARK); }
            else { R(4 + ex, 4 + ey, 1, 3, DARK); R(8 + ex, 4 + ey, 1, 3, DARK); }
        }
        else if (st == S.Held || st == S.Fall) { R(3.5 + ox * 0.3, 4, 2, 3.4, DARK); R(8.5 + ox * 0.3, 4, 2, 3.4, DARK); }
        else if (st == S.Land) { R(3.5, 5.7, 2, 0.8, DARK); R(8.5, 5.7, 2, 0.8, DARK); }
        else if (st == S.Asking) { R(3.5, 4, 2, 3.2, DARK); R(8.5, 4, 2, 3.2, DARK); R(4.3, 4.4, 0.7, 0.7, WHITE); R(9.3, 4.4, 0.7, 0.7, WHITE); }
        else if (st == S.Work && !blink) { R(4 + ox, 4.6 + oy * 0.4, 1, 2.6, DARK); R(9 + ox, 4.6 + oy * 0.4, 1, 2.6, DARK); }
        else if (blink) { R(4 + ox, 5.3 + oy, 1, 0.5, DARK); R(9 + ox, 5.3 + oy, 1, 0.5, DARK); }
        else { R(4 + ox, 4 + oy, 1, 3, DARK); R(9 + ox, 4 + oy, 1, 3, DARK); }

        // lo que tiene entre manos mientras Claude trabaja
        if (st == S.Work)
        {
            if (webMood)
            {
                // su libro (solo cuando Claude busca en internet), con una hoja que pasa de vez en cuando
                R(3, 6.5, 8, 3, COVER);
                R(3.5, 6.8, 3.4, 2.4, PAGE); R(7.2, 6.8, 3.4, 2.4, PAGE); R(6.9, 6.8, 0.3, 2.4, PAGEDIM);
                R(3.9, 7.4, 2.6, 0.4, PAGEDIM); R(3.9, 8.2, 2.1, 0.4, PAGEDIM); R(7.6, 7.4, 2.6, 0.4, PAGEDIM); R(7.6, 8.2, 1.8, 0.4, PAGEDIM);
                double ph = (t % 5.0) / 5.0;
                if (ph > 0.7 && ph < 0.86) { double k = (ph - 0.7) / 0.16; double w = 3.4 * Math.Abs(1 - 2 * k); R(k < 0.5 ? 7.2 : 6.9 - w, 6.8, w, 2.4, PAPER); } // de la página derecha, por el lomo, a la izquierda
                R(2.2, 7.7, 1.2, 1.2, BODY); R(10.6, 7.7, 1.2, 1.2, BODY);
            }
            else
            {
                // su portátil, con líneas de código que se encienden
                R(3.6, 6.2, 6.8, 3.1, SCREEN); R(3.6, 6.2, 6.8, 0.4, METAL);
                R(4.1, 7, 3.4, 0.5, Pulse(GREEN, SCREEN, t, 0));
                R(4.1, 7.8, 4.6, 0.5, Pulse(GREEN, SCREEN, t, 0.3));
                R(4.1, 8.6, 2.4, 0.5, Pulse(GREEN, SCREEN, t, 0.6));
                R(2.6, 9.4, 8.8, 0.9, METAL);
                // las chispitas azules alrededor (como en la banda)
                double[][] sp = { new double[] { 0.3, 2, 0 }, new double[] { 12.8, 1, 0.25 }, new double[] { -0.2, 4.5, 0.5 } };
                foreach (double[] q in sp) if (((t + 0.7 - q[2]) % 0.7) < 0.35) R(q[0], q[1], 1, 1, BLUE);
                // estrellitas: se ha completado una herramienta (tres, escalonadas, 0,7 s)
                double[][] st3 = { new double[] { 0.8, 2.5, 0 }, new double[] { 13.2, 1.5, 0.12 }, new double[] { 0.3, 5, 0.24 } };
                foreach (double[] q in st3)
                {
                    double k = (t - sparkAt - q[2]) / 0.7;
                    if (k < 0 || k > 1) continue;
                    R(q[0], q[1], 1, 1, STAR); // el centro (no hay transparencia en esta ventana: se encoge en vez de desvanecerse)
                    if (k > 0.12 && k < 0.8) { R(q[0] - 1, q[1], 1, 1, STAR); R(q[0] + 1, q[1], 1, 1, STAR); R(q[0], q[1] - 1, 1, 1, STAR); R(q[0], q[1] + 1, 1, 1, STAR); }
                }
            }
        }

        G.Restore(saved);

        // adornos encima (sin girar con el cuerpo)
        GraphicsState s2 = G.Save();
        G.TranslateTransform(MX * P, MT * P);
        G.ScaleTransform(P, P);
        if (st == S.Petting)
        {
            for (int k = 0; k < 2; k++)
            {
                double ph = (stT * 0.8 + k * 0.45) % 1.0;
                double hx = 1.5 + k * 6, hy = -0.5 - ph * 6;
                R(hx, hy, 2, 1, PINK); R(hx + 3, hy, 2, 1, PINK); R(hx, hy + 1, 5, 1, PINK); R(hx + 1, hy + 2, 3, 1, PINK); R(hx + 2, hy + 3, 1, 1, PINK);
            }
        }
        else if (st == S.Sleep)
        {
            for (int k = 0; k < 2; k++)
            {
                double ph = (t / 2.6 + k * 0.5) % 1.0;
                double zx = 9 + k * 1.5 + ph * 2, zy = 1 - ph * 5;
                R(zx, zy, 2, 0.7, BLUE); R(zx + 1.2, zy + 0.7, 0.8, 0.8, BLUE); R(zx, zy + 1.5, 2, 0.7, BLUE);
            }
        }
        else if (st == S.Dizzy)
        {
            double a = t * 7.8;
            R(6.5 + Math.Cos(a) * 3, 0.5 + Math.Sin(a) * 0.8, 1, 1, YELLOW);
            R(6.5 - Math.Cos(a) * 3, 0.5 - Math.Sin(a) * 0.8, 1, 1, YELLOW);
        }
        else if (st == S.Alert)
        {
            // "¡!" que salta encima de la cabeza
            double pop = Math.Min(1, stT / 0.12), hop = -Math.Abs(Math.Sin(stT * 9)) * 0.8;
            R(6.4, -4.2 + hop, 1.4, 2.8 * pop, YELLOW);
            if (pop >= 1) R(6.4, -0.8 + hop, 1.4, 1.2, YELLOW);
        }
        else if (st == S.Curious && t - lastTypeAt < 1.8)
        {
            // un "?" que da saltitos encima de la cabeza
            double hop = -Math.Abs(Math.Sin((t - lastTypeAt) * 7)) * 0.8;
            double qx = 10.2, qy = -1.2 + hop;
            R(qx, qy, 2.2, 0.8, WHITE); R(qx + 1.8, qy + 0.6, 0.8, 1.4, WHITE); R(qx + 0.9, qy + 1.8, 1, 1, WHITE); R(qx + 0.9, qy + 3.4, 1, 0.9, WHITE);
        }
        else if (st == S.Work && thinkingMood)
        {
            // los tres puntitos de pensar
            for (int k = 0; k < 3; k++) if (((t * 1.4 + k * 0.22) % 1.0) < 0.6) R(5.5 + k * 1.5, 1.2, 1, 1, WHITE);
        }
        G.Restore(s2);

        // encima de la cabeza, por prioridad: un permiso, tus límites de uso, el aviso de "terminado", lo que hace Claude
        btnAllow = btnDeny = btnApp = RectangleF.Empty;
        if (asks.Count > 0) AskBubble(asks[0]);
        else if (st == S.Announce || (st == S.Peek && stT > 0.3 && stT < 5.6)) Bubble(L.T("¡Claude ha", "Claude has"), L.T("terminado!", "finished!"));
    }

    // ── bocadillos (texto suavizado, siempre sobre fondo sólido: sin bordes contra el color transparente) ──

    Font UiFont(float px, bool bold) { return new Font("Segoe UI", px * P, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel); }

    /** Caja con borde de 1 "píxel" del sprite, esquinas recortadas, y su colita hacia la cabeza. */
    void Card(RectangleF box, Color fill, Color edge, bool tail)
    {
        G.SmoothingMode = SmoothingMode.None;
        G.PixelOffsetMode = PixelOffsetMode.Default;
        float h = P / 2f;
        using (SolidBrush e = new SolidBrush(edge))
        using (SolidBrush f = new SolidBrush(fill))
        {
            G.FillRectangle(e, box.X - h, box.Y + h, box.Width + 2 * h, box.Height - 2 * h);
            G.FillRectangle(e, box.X + h, box.Y - h, box.Width - 2 * h, box.Height + 2 * h);
            G.FillRectangle(f, box);
            if (tail)
            {
                float cx = (MX + 7) * P;
                G.FillRectangle(e, cx - P - h, box.Bottom, 2 * P + 2 * h, P);
                G.FillRectangle(f, cx - P, box.Bottom, 2 * P, P - h);
                G.FillRectangle(e, cx - h - h, box.Bottom + P - h, P + 2 * h, P);
                G.FillRectangle(f, cx - h, box.Bottom + P - h, P, P - h);
            }
        }
        G.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
    }

    string Fit(string s, Font f, float w)
    {
        if (G.MeasureString(s, f).Width <= w) return s;
        while (s.Length > 1 && G.MeasureString(s + "…", f).Width > w) s = s.Substring(0, s.Length - 1);
        return s + "…";
    }

    /** "¿Permites...?" con sus tres botones. */
    void AskBubble(Ask a)
    {
        float cx = (MX + 7) * P;
        float w = (GW + 2 * MX - 2) * P;
        using (Font title = UiFont(2.1f, true))
        using (Font body = UiFont(1.8f, false))
        using (Font btn = UiFont(1.9f, true))
        using (SolidBrush ink = new SolidBrush(DARK))
        using (SolidBrush muted = new SolidBrush(MUTED))
        using (SolidBrush white = new SolidBrush(WHITE))
        using (SolidBrush orange = new SolidBrush(BODY))
        using (SolidBrush paper = new SolidBrush(PAPER))
        using (SolidBrush edge = new SolidBrush(SHADE))
        {
            float lh1 = G.MeasureString("Ag", title).Height, lh2 = G.MeasureString("Ag", body).Height, bh = 3.2f * P;
            float hgt = 0.8f * P + lh1 + lh2 + 0.8f * P + bh + 0.9f * P;
            RectangleF box = new RectangleF(cx - w / 2, (MT - 1.2f) * P - hgt, w, hgt);
            Card(box, PAPER, SHADE, true);
            float yy = box.Y + 0.6f * P;
            G.DrawString(Fit(L.T("Claude quiere usar ", "Claude wants to use ") + a.Tool, title, w - 2 * P), title, ink, box.X + P, yy);
            yy += lh1;
            string shown = Fit(a.Summary, body, w - 2 * P);
            askCut = shown != a.Summary;
            G.DrawString(shown, body, muted, box.X + P, yy);
            yy += lh2 + 0.8f * P;
            // botones: Permitir (naranja), No, Claude (abre el diálogo de la app)
            float gap = 0.8f * P, bw = (w - 2 * P - 2 * gap) / 3f;
            btnAllow = new RectangleF(box.X + P, yy, bw, bh);
            btnDeny = new RectangleF(btnAllow.Right + gap, yy, bw, bh);
            btnApp = new RectangleF(btnDeny.Right + gap, yy, bw, bh);
            G.SmoothingMode = SmoothingMode.None;
            G.FillRectangle(orange, btnAllow);
            G.FillRectangle(edge, btnDeny); G.FillRectangle(paper, RectangleF.Inflate(btnDeny, -P / 3f, -P / 3f));
            G.FillRectangle(edge, btnApp); G.FillRectangle(paper, RectangleF.Inflate(btnApp, -P / 3f, -P / 3f));
            Label(btnAllow, askCut ? L.T("Revisar", "Review") : L.T("Permitir", "Allow"), btn, white);
            Label(btnDeny, "No", btn, ink);
            Label(btnApp, "Claude", btn, ink);
        }
    }

    void Label(RectangleF r, string s, Font f, Brush b)
    {
        SizeF z = G.MeasureString(s, f);
        G.DrawString(s, f, b, r.X + (r.Width - z.Width) / 2, r.Y + (r.Height - z.Height) / 2);
    }

    /** El aviso de "terminado": un bocadillo de dos líneas justo encima de la cabeza. */
    void Bubble(string l1, string l2)
    {
        using (Font f = UiFont(2.3f, true))
        using (SolidBrush ink = new SolidBrush(DARK))
        {
            SizeF a = G.MeasureString(l1, f), b = G.MeasureString(l2, f);
            float w = Math.Max(a.Width, b.Width) + 2.4f * P, h = a.Height + b.Height + 1.2f * P;
            float cx = (MX + 7) * P, top = (MT - 2.2f) * P - h;
            RectangleF box = new RectangleF(cx - w / 2, top, w, h);
            Card(box, PAPER, SHADE, true);
            G.DrawString(l1, f, ink, cx - a.Width / 2, top + 0.6f * P);
            G.DrawString(l2, f, ink, cx - b.Width / 2, top + 0.6f * P + a.Height);
        }
    }
}

/** Doble clic derecho en Clawd: una cajita minimalista para escribirle a Claude. Intro envía, Esc cierra. */
// ── historias: avión de papel, mapa, cascos y mariposa (las mismas líneas de tiempo que en la banda) ─────────────

/** La postura de Clawd en un instante de una historia (píxeles del sprite). */
class StoryPose
{
    public double Dy, Rot, Sx = 1, Sy = 1;
    public double[] AL = new double[2], AR = new double[2];
    public double ArW = 2; // ancho del brazo derecho (al extender la mano se alarga)
    public double[] Legs = { 2, 2, 2, 2 };
    public bool Happy;
    public double Gx, Gy, Eh = 3, Ecy = 5.5, Blink;
}

static class Story
{
    public const double PlaneT = 9, MapT = 9.5, MusicT = 9, ChaseT = 16;

    // ── curvas ──
    public static double Lerp(double a, double b, double t) { return a + (b - a) * t; }
    public static double Cl(double v, double a, double b) { return Math.Min(b, Math.Max(a, v)); }
    static double EOut(double k) { k = Cl(k, 0, 1); return 1 - Math.Pow(1 - k, 3); }
    static double EIn(double k) { k = Cl(k, 0, 1); return k * k * k; }
    static double EIo(double k) { k = Cl(k, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.Pow(-2 * k + 2, 3) / 2; }
    static double EBack(double k) { k = Cl(k, 0, 1); double c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.Pow(k - 1, 3) + c1 * Math.Pow(k - 1, 2); }
    // id: 0 suave (por defecto), 1 salida, 2 entrada, 3 lineal, 4 rebote
    static double EaseId(int id, double k)
    {
        switch (id) { case 1: return EOut(k); case 2: return EIn(k); case 3: return Cl(k, 0, 1); case 4: return EBack(k); default: return EIo(k); }
    }
    /** Valor entre claves {tiempo, valor, ease?}; el ease de una clave rige el tramo que empieza en ella. */
    public static double Kf(double t, double[][] K)
    {
        if (t <= K[0][0]) return K[0][1];
        for (int i = 0; i < K.Length - 1; i++)
        {
            double[] a = K[i], b = K[i + 1];
            if (t <= b[0]) return Lerp(a[1], b[1], EaseId(a.Length > 2 ? (int)a[2] : 0, (t - a[0]) / (b[0] - a[0])));
        }
        return K[K.Length - 1][1];
    }
    /** Curva suave (Catmull-Rom) por claves {tiempo, valor}. */
    public static double Cr(double t, double[][] K)
    {
        int n = K.Length;
        if (t <= K[0][0]) return K[0][1];
        if (t >= K[n - 1][0]) return K[n - 1][1];
        int i = 0;
        while (i < n - 2 && t > K[i + 1][0]) i++;
        double t0 = K[i][0], v0 = K[i][1], t1 = K[i + 1][0], v1 = K[i + 1][1], h = t1 - t0, s = (t - t0) / h;
        double m0 = i > 0 ? (v1 - K[i - 1][1]) / (t1 - K[i - 1][0]) : (v1 - v0) / h;
        double m1 = i < n - 2 ? (K[i + 2][1] - v0) / (K[i + 2][0] - t0) : (v1 - v0) / h;
        double s2 = s * s, s3 = s2 * s;
        return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * m1;
    }
    public static bool Win(double t, double a, double b) { return t >= a && t <= b; }
    public static double BlinkAt(double t)
    {
        double m = (t + 1.3) % 4.1;
        return m > 3.95 ? 1 - Math.Abs((m - 4.025) / 0.075) : 0;
    }
    public static double Pop(double t, double a, double d) { return t < a ? 0 : t < a + d ? EBack((t - a) / d) : 1; }
    static double[] K2(double t, double v) { return new double[] { t, v }; }
    static double[] K3(double t, double v, double e) { return new double[] { t, v, e }; }

    public static StoryPose Base(double t)
    {
        StoryPose p = new StoryPose();
        p.AL[0] = 5.2 + 0.2 * Math.Sin(t * 2.6); p.AL[1] = 2;
        p.AR[0] = 5.2 - 0.2 * Math.Sin(t * 2.6); p.AR[1] = 2;
        p.Blink = BlinkAt(t);
        return p;
    }
    static void Arms(StoryPose p, double y, double h) { p.AL[0] = y; p.AL[1] = h; p.AR[0] = y; p.AR[1] = h; }

    // ── 1 · avión de papel ──
    public class PlaneFrame { public StoryPose P; public double X, Y, Rot, Sc, Vis; public double[][] Trail = { new double[3], new double[3], new double[3] }; }
    const double PlaneTR = 2.62, PlaneTL = 6.1;
    static double FlyX(double u) { return 14.2 + 19.3 * (1 - Math.Pow(1 - u, 1.6)); }
    static readonly double[][] FlyKeys = { K2(0, 2.4), K2(0.2, -0.8), K2(0.5, 0), K2(0.8, 5.2), K2(0.93, 8.1), K2(1, 8.6) };
    static double FlyY(double u) { return Cr(u, FlyKeys) + 0.3 * Math.Sin(u * 17) * (1 - u); }
    static double FlySlope(double u)
    {
        double a = Cl(u, 0, 0.985), b = a + 0.012;
        return Math.Atan2(FlyY(b) - FlyY(a), FlyX(b) - FlyX(a)) * 180 / Math.PI;
    }
    static readonly double[][] PHandY = { K2(0, 5), K2(0.55, 5), K2(1, 2.8), K2(1.75, 2.8), K2(2.25, 0.9), K2(2.5, 0.9), K3(2.72, 3.4, 1), K2(3.3, 5) };
    static readonly double[][] PHandH = { K2(0, 2), K2(0.55, 2), K2(1, 2.6), K2(2.25, 3.6), K2(2.5, 3.6), K2(2.72, 2.4), K2(3.3, 2) };
    static readonly double[][] PLean = { K2(0, 0), K2(1.7, 0), K2(2.25, -6), K2(2.5, -6), K3(2.75, 7, 1), K2(3.3, 0) };
    static readonly double[][] PRot = { K2(0.55, -30), K2(1, -30), K2(1.25, -48), K2(1.55, -22), K2(1.75, -30), K2(2.25, -62), K2(2.5, -62), K2(2.62, -14) };
    static readonly double[][] PGx = { K2(0.55, 0), K2(0.9, 0.8), K2(2.0, 0.8), K2(2.2, 1), K2(2.62, 1) };
    static readonly double[][] PGy = { K2(0.55, 0), K2(0.9, -0.8), K2(2.0, -0.8), K2(2.2, -0.5), K2(2.62, -0.45) };

    public static PlaneFrame Plane(double t)
    {
        PlaneFrame f = new PlaneFrame();
        double lean = Kf(t, PLean), handY = Kf(t, PHandY), aRh = Kf(t, PHandH);
        double hop = Win(t, 6.3, 6.9) ? Math.Sin((t - 6.3) / 0.6 * Math.PI) : 0;
        double up = Pop(t, 6.25, 0.3) * (t < 7.1 ? 1 : 1 - EIo(Cl((t - 7.1) / 0.5, 0, 1)));
        double sq = Win(t, 6.9, 7.12) ? 1 - 0.1 * Math.Sin((t - 6.9) / 0.22 * Math.PI) : 1;
        StoryPose p = Base(t);
        p.Dy = -hop * 2.4; p.Rot = lean; p.Sy = sq; p.Sx = 1 / sq * 0.5 + 0.5;
        if (t > 0.5 && t < 3.3) { p.AR[0] = handY; p.AR[1] = aRh; }
        if (up > 0)
        {
            p.AL[0] = Lerp(5, 1.5, up); p.AL[1] = Lerp(2, 3.5, up);
            p.AR[0] = Lerp(p.AR[0], 1.5, up); p.AR[1] = Lerp(p.AR[1], 3.5, up);
        }
        if (hop > 0) p.Legs = new double[] { 1, 1, 1, 1 };
        double x, y, rot, sc = 1, vis = 1;
        if (t < PlaneTR)
        {
            double a = lean * Math.PI / 180, dx = (13.7 - 7) * p.Sx, dy = (handY - 0.5 - 11) * p.Sy;
            x = 7 + dx * Math.Cos(a) - dy * Math.Sin(a);
            y = 11 + dx * Math.Sin(a) + dy * Math.Cos(a) + p.Dy;
            rot = Kf(t, PRot) + lean;
            sc = Pop(t, 0.5, 0.3) * 0.9;
            if (t < 0.5) vis = 0;
        }
        else
        {
            double u = Cl((t - PlaneTR) / (PlaneTL - PlaneTR), 0, 1);
            x = FlyX(u); y = FlyY(u); sc = 0.9;
            double land = EIo(Cl((u - 0.86) / 0.14, 0, 1));
            rot = Cl(FlySlope(u), -34, 24) * (1 - land);
            if (u < 1)
            {
                for (int i = 0; i < 3; i++)
                {
                    double uu = u - (i + 1) * 0.075;
                    if (uu >= 0) { f.Trail[i][0] = FlyX(uu); f.Trail[i][1] = FlyY(uu); f.Trail[i][2] = 0.38 - i * 0.11; }
                }
            }
            if (t > 7.6) vis = Cl(1 - (t - 7.6) / 0.7, 0, 1);
        }
        if (t < 0.55) { p.Gx = 0; p.Gy = 0; }
        else if (t < PlaneTR) { p.Gx = Kf(t, PGx); p.Gy = Kf(t, PGy); }
        else { p.Gx = Cl((x - 7) / 8, -1, 1); p.Gy = Cl((y - 5.5) / 6, -1, 1); }
        if (t > 6.15 && t < 7.5) { p.Happy = true; p.Gx = 0; p.Gy = 0; }
        f.P = p; f.X = x; f.Y = y; f.Rot = rot; f.Sc = sc; f.Vis = vis;
        return f;
    }

    // ── 2 · mirando un mapa ──
    public class MapFrame { public StoryPose P; public double Sx, Drop, RotM, Hx, Hv, MapOp, QOp, QS, QBob, EOp, ES; }
    static readonly double[][] MSx = { K2(0, 0.1), K2(0.5, 0.1), K3(1.1, 1.04, 1), K2(1.3, 1), K2(6.1, 1), K3(6.9, 0.1, 2) };
    static readonly double[][] MDrop = { K2(6.1, 0), K3(6.9, 2.4, 2) };
    static readonly double[][] MRot = { K2(3.3, 0), K2(4.1, 180), K2(4.5, 180), K2(5.3, 360) };
    static readonly double[][] MHead = { K2(3.4, 0), K2(3.9, -5), K2(4.9, -5), K2(5.4, 0) };
    static readonly double[][] MAUp = { K2(6.3, 0), K3(6.6, 1, 1), K2(7.7, 1), K2(8.3, 0) };
    static readonly double[][] MGx = { K2(1.3, 0), K2(1.5, -0.8), K2(2.0, -0.8), K2(2.3, -0.3), K2(2.6, 0.1), K2(2.9, 0.5), K2(3.3, 0.9), K2(3.6, 0.9), K2(4.1, -0.6), K2(4.5, 0.6), K2(4.9, -0.3), K2(5.3, 0), K2(5.6, 0.9), K2(6.5, 0.9), K2(6.9, 0) };
    static readonly double[][] MGy = { K2(1.3, 0), K2(1.5, 0.5), K2(3.5, 0.5), K2(5.4, 0.2), K2(5.7, -0.8), K2(6.6, -0.8), K2(6.9, 0) };

    public static MapFrame Map(double t)
    {
        MapFrame m = new MapFrame();
        double sx = Kf(t, MSx);
        double pres = Cl((sx - 0.1) / 0.9, 0, 1) * (t > 6.1 && t < 6.9 ? 1 - EIo((t - 6.1) / 0.8) : 1);
        bool mapVis = t > 0.5 && t < 6.9;
        double drop = Kf(t, MDrop);
        double head = (Win(t, 1.4, 3.2) ? 2.6 * Math.Sin((t - 1.4) * 2.4) : 0) + Kf(t, MHead);
        double hop = Win(t, 6.5, 7.0) ? Math.Sin((t - 6.5) / 0.5 * Math.PI) : 0;
        double sq = Win(t, 7.0, 7.2) ? 1 - 0.09 * Math.Sin((t - 7.0) / 0.2 * Math.PI) : 1;
        StoryPose p = Base(t);
        p.Dy = -hop * 1.9; p.Rot = head; p.Sy = sq;
        if (hop > 0) p.Legs = new double[] { 1.1, 1.1, 1.1, 1.1 };
        if (pres > 0) Arms(p, Lerp(5.2, 6.2, pres), Lerp(2, 2.6, pres));
        double aUp = Kf(t, MAUp);
        if (aUp > 0)
        {
            double w = 0.5 * Math.Sin((t - 6.7) * 15) * (Win(t, 6.7, 7.4) ? 1 : 0);
            p.AR[0] = Lerp(p.AR[0], 1.4 + w, aUp); p.AR[1] = Lerp(p.AR[1], 3.6, aUp);
        }
        p.Eh = Lerp(3, 1.7, pres); p.Ecy = Lerp(5.5, 4.85, pres);
        p.Gx = Kf(t, MGx); p.Gy = Kf(t, MGy);
        if (Win(t, 6.55, 7.7)) { p.Happy = true; p.Gx = 0; p.Gy = 0; }
        m.P = p;
        m.Sx = Math.Max(sx, 0.02); m.Drop = drop; m.RotM = Kf(t, MRot);
        m.Hx = 4.5 * m.Sx; m.Hv = mapVis && sx > 0.35 && t < 6.6 ? 1 : 0;
        m.MapOp = mapVis ? Cl(1 - Math.Max(0, t - 6.5) / 0.4, 0, 1) : 0;
        m.QOp = Win(t, 3.5, 5.5) ? (t > 5.15 ? 1 - (t - 5.15) / 0.35 : 1) : 0;
        m.QS = Math.Max(Pop(t, 3.5, 0.3), 0.01); m.QBob = -0.4 * Math.Sin(t * 7);
        m.EOp = Win(t, 5.65, 7.0) ? (t > 6.6 ? 1 - (t - 6.6) / 0.4 : 1) : 0;
        m.ES = Math.Max(Pop(t, 5.65, 0.3), 0.01);
        return m;
    }

    // ── 3 · cascos de música ──
    public class MusicFrame { public StoryPose P; public double Hy, HpOp, Led; }
    const double Beat = 0.5;
    static readonly double[][] HpPut = { K2(0.5, -9), K3(1.1, 0, 4) };
    static readonly double[][] HpOff = { K2(7.15, 0), K3(7.9, -9, 2) };
    static readonly double[][] MuUp1 = { K2(0.5, 0), K2(0.8, 1), K2(1.2, 1), K2(1.6, 0) };
    static readonly double[][] MuUp2 = { K2(6.95, 0), K2(7.25, 1), K2(7.75, 1), K2(8.3, 0) };

    public static MusicFrame Music(double t)
    {
        MusicFrame f = new MusicFrame();
        f.Hy = t < 7.15 ? Kf(t, HpPut) : Kf(t, HpOff);
        f.HpOp = t < 0.5 ? 0 : t > 7.5 ? Cl(1 - (t - 7.5) / 0.4, 0, 1) : 1;
        double g = Cl((t - 1.7) / 0.4, 0, 1) * (t > 7.0 ? 1 - Cl((t - 7.0) / 0.3, 0, 1) : 1);
        double ph = ((((t - 1.7) % Beat) + Beat) % Beat) / Beat;
        int beat = (int)Math.Floor((t - 1.7) / Beat);
        StoryPose p = Base(t);
        f.Led = 0.5;
        if (g > 0)
        {
            double squash = 1 - 0.075 * Math.Exp(-ph * 7) + 0.02 * Math.Sin(ph * Math.PI);
            p.Sy = Lerp(1, squash, g);
            p.Rot = g * 3.2 * Math.Sin((t - 1.7) * Math.PI * 2 / (Beat * 2));
            double bump = Math.Exp(-ph * 6);
            p.AL[0] = 5 - g * 1.2 * bump * (beat % 2 != 0 ? 1 : 0.3); p.AL[1] = 2;
            p.AR[0] = 5 - g * 1.2 * bump * (beat % 2 != 0 ? 0.3 : 1); p.AR[1] = 2;
            bool s = beat % 2 != 0;
            double[] want = { s ? 2 : 1.2, s ? 1.2 : 2, s ? 2 : 1.2, s ? 1.2 : 2 };
            for (int i = 0; i < 4; i++) p.Legs[i] = Lerp(2, want[i], g);
            f.Led = 0.35 + 0.65 * Math.Exp(-ph * 4);
            if (t > 2.0) p.Happy = true;
        }
        if (Win(t, 0.6, 1.5)) { double a = Kf(t, MuUp1); Arms(p, Lerp(5, 1.5, a), Lerp(2, 3.5, a)); }
        if (Win(t, 6.95, 8.3)) { double a = Kf(t, MuUp2); Arms(p, Lerp(5, 1.5, a), Lerp(2, 3.5, a)); }
        f.P = p;
        return f;
    }
    /** La nota k: dónde está, cuánto mide y si se ve (false = no). Sale de un auricular y sube de lado a lado. */
    public static bool Note(int k, double t, out double x, out double y, out double sc, out double op)
    {
        double t0 = 2.3 + k * 0.8, a = (t - t0) / 2.1;
        int side = k % 2 != 0 ? 1 : -1;
        x = y = sc = op = 0;
        if (a < 0 || a > 1) return false;
        x = (side < 0 ? 0.6 : 11.8) + side * a * 4.2 + Math.Sin(a * 9 + k) * 0.9;
        y = 1.6 - a * 7.2;
        sc = 0.55 + 0.45 * EOut(Math.Min(1, a * 4));
        op = a < 0.12 ? a / 0.12 : a > 0.55 ? (1 - a) / 0.45 : 1;
        return true;
    }

    // ── 4 · mariposa ──
    // Todo en "unidades hacia delante" desde donde empezó Clawd (x) y desde sus pies (y, negativo = arriba).
    public const double ChaseStop = 8; // dónde se para Clawd (su centro), hacia delante
    public const double HandFwd = 6.8; // la punta de la mano, hacia delante del centro de Clawd
    static readonly double[][] BfX = { K2(0.4, 36), K2(1.2, 25), K2(2.2, 18), K2(3.0, 24), K2(3.9, 15), K2(4.7, 20), K2(5.6, 9), K2(6.5, 16), K2(7.4, 12), K2(8.2, 11.5), K2(9.2, 14.5), K2(10, 16.5), K2(10.8, 15.4), K2(11.4, 14.8), K2(13.6, 14.8), K2(14.0, 17.3), K2(14.6, 22), K2(15.3, 29) };
    static readonly double[][] BfY = { K2(0.4, -14), K2(1.2, -12), K2(2.2, -8.5), K2(3.0, -13), K2(3.9, -6.5), K2(4.7, -11), K2(5.6, -12), K2(6.5, -7.5), K2(7.4, -9.5), K2(8.2, -10), K2(9.2, -11.5), K2(10, -10.8), K2(10.8, -9.2), K2(11.4, -8.1), K2(13.6, -8.1), K2(14.0, -10.1), K2(14.6, -14.5), K2(15.3, -19) };
    public static double BflyX(double t) { return Cr(t, BfX); }
    public static double BflyY(double t) { return Cr(t, BfY); }
    // frecuencia de aleteo (veces por segundo): baja al acercarse y casi se detiene al posarse
    static readonly double[][] BfFreq = { K3(0, 6.5, 3), K3(8.2, 6.5, 3), K3(10.6, 3.2, 3), K3(11.3, 1.4, 3), K3(11.6, 0.55, 3), K3(13.5, 0.55, 3), K3(14.0, 5.5, 3), K3(14.4, 6.5, 3), K2(16, 6.5) };
    public static double BflyFreq(double t) { return Kf(t, BfFreq); }
    public static readonly double[][] Hops = { new double[] { 1.3, 0.45, 1.2 }, new double[] { 3.85, 0.55, 3.0 }, new double[] { 5.55, 0.55, 3.0 } };
    const double SimDt = 1.0 / 120;
    public class ChaseSim { public double[] Off, Fs, Step, V, Fd; }
    /** La persecución de antemano (como en la vista previa): dónde está Clawd, hacia dónde mira y cuánto lleva andado en cada instante. */
    public static ChaseSim Simulate()
    {
        int n = (int)(ChaseT / SimDt) + 1;
        ChaseSim s = new ChaseSim();
        s.Off = new double[n]; s.Fs = new double[n]; s.Step = new double[n]; s.V = new double[n]; s.Fd = new double[n];
        double off = 0, v = 0, fs = 1, fdir = 1, step = 0;
        for (int i = 0; i < n; i++)
        {
            double t = i * SimDt, target;
            if (t < 1.7) target = 0;
            else if (t < 7.2) target = Cl(BflyX(t) - 2, -2, 27);
            else target = ChaseStop;
            double d = target - off;
            double want = Cl(d * 2.3, -10.5, 10.5);
            v += Cl(want - v, -38 * SimDt, 38 * SimDt);
            off += v * SimDt;
            if (Math.Abs(v) > 1.4) fdir = v < 0 ? -1 : 1;
            if (t > 7.8) fdir = 1;
            if (t < 1.6) fdir = 1;
            fs += (fdir - fs) * Math.Min(1, SimDt * 16);
            step += Math.Abs(v) * SimDt * 0.42;
            s.Off[i] = off; s.Fs[i] = fs; s.Step[i] = step; s.V[i] = v; s.Fd[i] = fdir;
        }
        return s;
    }
    public static int SimIndex(double t) { return (int)Cl(Math.Round(t / SimDt), 0, (int)(ChaseT / SimDt)); }

    public class ChaseFrame { public StoryPose P; public double ExOp, ExS, Bx, By, Tilt; public bool Landed, BflyVis; public double HandY; }
    static readonly double[][] CAExt = { K2(8.2, 0), K3(8.9, 1, 1), K2(13.8, 1), K2(14.5, 0) };
    public static ChaseFrame Chase(double t, double off, double v, double step, double fsSign)
    {
        ChaseFrame c = new ChaseFrame();
        bool moving = Math.Abs(v) > 1.1;
        double sw = Math.Sin(step * Math.PI * 2);
        double hop = 0, hopAmp = 0;
        for (int i = 0; i < Hops.Length; i++)
            if (Win(t, Hops[i][0], Hops[i][0] + Hops[i][1])) { hop = Math.Sin((t - Hops[i][0]) / Hops[i][1] * Math.PI); hopAmp = Hops[i][2]; }
        double aExt = Kf(t, CAExt);
        double dip = Win(t, 11.4, 11.95) ? 0.38 * Math.Sin((t - 11.4) / 0.55 * Math.PI) : 0; // la mano baja un poquito al posarse
        StoryPose p = Base(t);
        p.Dy = -hop * hopAmp + (moving ? -Math.Abs(sw) * 0.35 : 0);
        if (moving && hop <= 0)
        {
            for (int i = 0; i < 4; i++) p.Legs[i] = 1.65 + 0.35 * Math.Sin(step * Math.PI * 2 + (i % 2) * Math.PI);
            p.AL[0] = 5 + sw; p.AL[1] = 2; p.AR[0] = 5 - sw; p.AR[1] = 2;
            p.Rot = Cl(v * 0.25, -3, 3) * fsSign;
        }
        if (hop > 0) { p.Legs = new double[] { 1, 1, 1, 1 }; p.AL[0] = 1.6; p.AL[1] = 3.4; p.AR[0] = 1.6; p.AR[1] = 3.4; }
        if (aExt > 0)
        {
            p.AR[0] = Lerp(hop > 0 ? 1.6 : p.AR[0], 4.4 + dip, aExt);
            p.AR[1] = Lerp(hop > 0 ? 3.4 : p.AR[1], 2, aExt);
            p.ArW = Lerp(2, 3.6, aExt);
        }
        // la mariposa
        c.Landed = Win(t, 11.4, 13.6);
        c.Bx = BflyX(t); c.By = BflyY(t);
        if (c.Landed) { c.Bx = off + HandFwd; c.By = 4.4 + (aExt > 0 ? dip : 0) - 1.5 - 11; }
        c.BflyVis = t > 0.35 && t < 15.3;
        double vx = (BflyX(t + 0.02) - BflyX(t)) / 0.02;
        c.Tilt = c.Landed ? 0 : Cl(vx * 1.6, -18, 18);
        c.HandY = 4.4 + dip;
        // mirada
        if (t > 1.0 && t < 14.9)
        {
            p.Gx = Cl((c.Bx - off) / 12, -1, 1) * fsSign;
            p.Gy = Cl((c.By + 5.5) / 6, -1, 1);
        }
        if (Win(t, 11.6, 13.7)) { p.Happy = true; p.Gx = 0; p.Gy = 0; }
        c.ExOp = Win(t, 1.25, 2.1) ? (t > 1.8 ? 1 - (t - 1.8) / 0.3 : 1) : 0;
        c.ExS = Math.Max(Pop(t, 1.25, 0.3), 0.01);
        c.P = p;
        return c;
    }
}

/** Una ventanita transparente que se pasea con el avión o la mariposa (la de Clawd es demasiado pequeña para volar). */
class PropWin : Form
{
    public Action<Graphics> Painter;
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x08000000 | 0x80 | 0x8 | 0x20; // NOACTIVATE | TOOLWINDOW | TOPMOST | TRANSPARENT (el ratón la atraviesa)
            return cp;
        }
    }
    public PropWin(int size, Color key)
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = key;
        TransparencyKey = key;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint, true);
        ClientSize = new Size(size, size);
        Location = new Point(-5000, -5000);
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        try { if (Painter != null) Painter(e.Graphics); } catch (Exception ex) { Pet.Dbg(ex); }
    }
}

class PromptBox : Form
{
    static readonly Color PAPER = ColorTranslator.FromHtml("#fbf7f0");
    static readonly Color EDGE = ColorTranslator.FromHtml("#D97757");
    static readonly Color INK = ColorTranslator.FromHtml("#1f1a17");
    static readonly Color HINT = ColorTranslator.FromHtml("#a39a90");

    readonly TextBox input = new TextBox();
    readonly Label hint = new Label();
    readonly Action<string> send;

    /** Dónde va el cursor de texto (pantalla), para que Clawd lo siga con los ojos. */
    public Action<Point> Caret;

    void ReportCaret()
    {
        if (Caret == null) return;
        int sel = Math.Min(input.SelectionStart, input.Text.Length);
        int w = TextRenderer.MeasureText(input.Text.Substring(0, sel), input.Font, new Size(int.MaxValue, int.MaxValue), TextFormatFlags.NoPadding).Width;
        Caret(input.PointToScreen(new Point(Math.Min(w, input.Width), input.Height / 2)));
    }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x80 | 0x8; // TOOLWINDOW | TOPMOST (este sí coge el foco: es para escribir)
            return cp;
        }
    }

    public PromptBox(int p, double ds, Action<string> onSend)
    {
        send = onSend;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = EDGE;
        int w = (int)(360 * ds), h = (int)(44 * ds), b = Math.Max(2, (int)Math.Round(2 * ds));
        ClientSize = new Size(w, h);
        Padding = new Padding(b);

        Panel inner = new Panel();
        inner.BackColor = PAPER;
        inner.Dock = DockStyle.Fill;
        Controls.Add(inner);

        Font f = new Font("Segoe UI", (float)(15 * ds), FontStyle.Regular, GraphicsUnit.Pixel);
        input.BorderStyle = BorderStyle.None;
        input.BackColor = PAPER;
        input.ForeColor = INK;
        input.Font = f;
        input.Location = new Point((int)(12 * ds), (h - 2 * b - input.PreferredHeight) / 2);
        input.Width = w - 2 * b - (int)(24 * ds);
        inner.Controls.Add(input);

        hint.Text = L.T("Escribe a Claude…  (Intro envía · Esc cierra)", "Write to Claude…  (Enter sends · Esc closes)");
        hint.Font = f;
        hint.ForeColor = HINT;
        hint.BackColor = PAPER;
        hint.AutoSize = true;
        hint.Location = input.Location;
        hint.Click += delegate { input.Focus(); };
        inner.Controls.Add(hint);
        hint.BringToFront();

        input.TextChanged += delegate { hint.Visible = input.Text.Length == 0; ReportCaret(); };
        input.KeyUp += delegate { ReportCaret(); };
        input.MouseUp += delegate { ReportCaret(); };
        input.KeyDown += delegate (object s, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape) { e.SuppressKeyPress = true; Close(); }
            else if (e.KeyCode == Keys.Enter && !e.Shift)
            {
                e.SuppressKeyPress = true;
                string t = input.Text.Trim();
                if (t.Length > 0) send(t);
                Close();
            }
        };
        Deactivate += delegate { if (input.Text.Trim().Length == 0) Close(); }; // si te vas sin escribir, se cierra
        Shown += delegate { Activate(); input.Focus(); };
    }
}

/**
 * Doble clic izquierdo en Clawd: tus límites de uso, grandes y claros. Cuánto has usado, cuánto te queda y cuándo
 * se renueva cada uno. Al acercar el ratón se agranda con suavidad (para leerlo mejor); un clic la cierra, y
 * se cierra sola al rato si no la estás mirando.
 */
class UsagePanel : Form
{
    public const double ZOOM = 1.5;
    static readonly Color PAPER = ColorTranslator.FromHtml("#fbf7f0");
    static readonly Color EDGE = ColorTranslator.FromHtml("#e3d3c3");
    static readonly Color INK = ColorTranslator.FromHtml("#1f1a17");
    static readonly Color MUTED = ColorTranslator.FromHtml("#7d7268");
    static readonly Color TRACK = ColorTranslator.FromHtml("#eee4d8");
    static readonly Color FILL = ColorTranslator.FromHtml("#D97757");
    static readonly Color LOW = ColorTranslator.FromHtml("#d9534f");

    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int value, int size);

    const float W = 330, PAD = 20, HEAD = 26, ROW = 74; // tamaño de diseño (a escala 1, en px de 96 ppp)
    readonly double ds;
    readonly string[] rows;
    readonly Timer anim = new Timer();
    readonly Stopwatch clock = Stopwatch.StartNew();
    double scale = 1, lastT, lastHover;
    Point anchor; // centro de abajo (encima de Clawd)
    Rectangle area;

    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x08000000 | 0x80 | 0x8; // NOACTIVATE | TOOLWINDOW | TOPMOST
            return cp;
        }
    }

    public UsagePanel(double dpiScale, string[] data)
    {
        ds = dpiScale;
        rows = data;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = PAPER;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        SetScale(1);
        MouseDown += delegate { Close(); };
        anim.Interval = 15;
        anim.Tick += delegate { Tick(); };
        HandleCreated += delegate
        {
            int round = 2; // esquinas redondeadas de Windows 11
            try { DwmSetWindowAttribute(Handle, 33, ref round, 4); } catch { }
        };
        Shown += delegate { lastT = clock.Elapsed.TotalSeconds; lastHover = lastT; anim.Start(); };
        FormClosed += delegate { anim.Stop(); };
    }

    float DesignHeight() { return PAD + HEAD + Math.Max(1, rows.Length) * ROW + PAD - 8; }

    public void SetScale(double k)
    {
        scale = k;
        ClientSize = new Size((int)Math.Round(W * ds * k), (int)Math.Round(DesignHeight() * ds * k));
    }

    public void AnchorAt(Point bottomCenter, Rectangle work)
    {
        anchor = bottomCenter;
        area = work;
        Place();
    }

    void Place()
    {
        int l = anchor.X - Width / 2, t = anchor.Y - Height;
        if (area.Width > 0)
        {
            l = Math.Max(area.Left + 8, Math.Min(area.Right - Width - 8, l));
            t = Math.Max(area.Top + 8, t);
        }
        Location = new Point(l, t);
    }

    void Tick()
    {
        double t = clock.Elapsed.TotalSeconds;
        double dt = Math.Min(0.05, t - lastT);
        lastT = t;
        Rectangle hot = Bounds;
        hot.Inflate((int)(24 * ds), (int)(24 * ds));
        bool over = hot.Contains(Cursor.Position);
        if (over) lastHover = t;
        double target = over ? ZOOM : 1;
        if (Math.Abs(target - scale) > 0.002)
        {
            SetScale(scale + (target - scale) * Math.Min(1, dt * 11)); // crece y encoge con suavidad
            Place();
            Invalidate();
        }
        if (t - lastHover > 10) Close(); // si no la miras, se va sola
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        g.Clear(PAPER);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        float k = (float)(ds * scale);
        using (Pen edge = new Pen(EDGE, 1.5f * k)) g.DrawRectangle(edge, 0.75f * k, 0.75f * k, Width - 1.5f * k, Height - 1.5f * k);
        g.ScaleTransform(k, k);

        using (Font head = new Font("Segoe UI Semibold", 12.5f, GraphicsUnit.Pixel))
        using (Font name = new Font("Segoe UI Semibold", 17f, GraphicsUnit.Pixel))
        using (Font big = new Font("Segoe UI", 17f, FontStyle.Bold, GraphicsUnit.Pixel))
        using (Font small = new Font("Segoe UI", 13f, GraphicsUnit.Pixel))
        using (SolidBrush ink = new SolidBrush(INK))
        using (SolidBrush muted = new SolidBrush(MUTED))
        using (SolidBrush track = new SolidBrush(TRACK))
        {
            g.DrawString(L.T("Tus límites de uso", "Your usage limits"), head, muted, PAD - 2, PAD - 6);
            float y = PAD + HEAD;
            if (rows.Length == 0)
            {
                g.DrawString(L.T("Aún no hay datos: aparecen tras la primera respuesta de Claude.", "No data yet: it shows up after Claude's first reply."), small, muted, new RectangleF(PAD, y, W - 2 * PAD, ROW));
                return;
            }
            foreach (string row in rows)
            {
                string[] f = row.Split('|');
                double used = 0;
                double.TryParse(f.Length > 1 ? f[1] : "0", NumberStyles.Float, CultureInfo.InvariantCulture, out used);
                double left = Math.Max(0, Math.Min(100, 100 - used));
                // nombre a la izquierda; lo que te queda, grande, a la derecha
                g.DrawString(f[0], name, ink, PAD - 2, y);
                string free = Math.Round(left) + L.T(" % libre", " % left");
                SizeF fz = g.MeasureString(free, big);
                using (SolidBrush accent = new SolidBrush(left < 15 ? LOW : INK)) g.DrawString(free, big, accent, W - PAD - fz.Width + 2, y);
                // la barra: lo que te queda, en naranja (rojo si queda poco)
                float by = y + 28, bw = W - 2 * PAD, bh = 10;
                using (GraphicsPath tp = Pill(PAD, by, bw, bh)) g.FillPath(track, tp);
                if (left > 0.5)
                    using (GraphicsPath fp = Pill(PAD, by, (float)Math.Max(bh, bw * left / 100.0), bh))
                    using (SolidBrush fill = new SolidBrush(left < 15 ? LOW : FILL))
                        g.FillPath(fill, fp);
                string info = Math.Round(used) + L.T(" % usado", " % used") + (f.Length > 2 && f[2].Length > 0 ? L.T("  ·  se renueva en ", "  ·  resets in ") + f[2] : "");
                g.DrawString(info, small, muted, PAD - 2, by + bh + 6);
                y += ROW;
            }
        }
    }

    static GraphicsPath Pill(float x, float y, float w, float h)
    {
        GraphicsPath p = new GraphicsPath();
        float r = h;
        p.AddArc(x, y, r, r, 90, 180);
        p.AddArc(x + w - r, y, r, r, 270, 180);
        p.CloseFigure();
        return p;
    }
}

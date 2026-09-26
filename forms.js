// №2. Векторная и проекционная (скалярная) формы записи.
// Ключ — заголовок карточки (поле t в data.js).
window.FORMS = {
  "Ускорение": {
    vec: "\\vec{a} = \\dfrac{\\vec{v} - \\vec{v}_0}{t}",
    proj: "a_x = \\dfrac{v_x - v_{0x}}{t}"
  },
  "Скорость при равноускоренном движении": {
    vec: "\\vec{v} = \\vec{v}_0 + \\vec{a}\\,t",
    proj: "v_x = v_{0x} + a_x t"
  },
  "Перемещение при равноускоренном движении": {
    vec: "\\vec{S} = \\vec{v}_0 t + \\dfrac{\\vec{a} t^2}{2}",
    proj: "S_x = v_{0x} t + \\dfrac{a_x t^2}{2}"
  },
  "Координата при равноускоренном движении": {
    vec: "\\vec{r} = \\vec{r}_0 + \\vec{v}_0 t + \\dfrac{\\vec{a} t^2}{2}",
    proj: "x = x_0 + v_{0x} t + \\dfrac{a_x t^2}{2}"
  },
  "Второй закон Ньютона": {
    vec: "\\vec{F} = m\\vec{a}",
    proj: "F_x = m a_x"
  },
  "Импульс тела": {
    vec: "\\vec{p} = m\\vec{v}",
    proj: "p_x = m v_x"
  },
  "Второй закон Ньютона в импульсной форме": {
    vec: "\\vec{F}\\,\\Delta t = \\Delta \\vec{p}",
    proj: "F_x \\Delta t = \\Delta p_x"
  },
  "Закон сохранения импульса": {
    vec: "\\sum \\vec{p}_{\\text{нач}} = \\sum \\vec{p}_{\\text{кон}}",
    proj: "\\sum p_{x,\\text{нач}} = \\sum p_{x,\\text{кон}}"
  },
  "Напряжённость поля точечного заряда": {
    vec: "\\vec{E} = \\dfrac{\\vec{F}}{q}",
    proj: "E_x = \\dfrac{F_x}{q}"
  },
  "Сила Ампера": {
    vec: "\\vec{F}_A = I\\,\\vec{l} \\times \\vec{B}",
    proj: "F_A = B I l \\sin\\alpha"
  },
  "Сила Лоренца": {
    vec: "\\vec{F}_L = q\\,\\vec{v} \\times \\vec{B}",
    proj: "F_L = q v B \\sin\\alpha"
  }
};

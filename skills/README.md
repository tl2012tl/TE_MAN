# TE MAN Skills

构想台只读取当前 `TE_image/skills` 目录，不会读取其他插件的 Skill。

每个 Skill 使用独立子目录，至少包含 `SKILL.md` 或 `SKILL.cn.md`：

```text
skills/
  skill-name/
    SKILL.md
    SKILL.cn.md
    meta.yaml
    references/
```

- `SKILL.cn.md` 存在时优先加载，否则加载 `SKILL.md`。
- `meta.yaml` 可使用 `display-name-zh` 和 `summary-cn` 提供中文名称与简介。
- `references/` 支持 `.md`、`.txt`、`.yaml`、`.yml` 和 `.json` 文件，由 Skill 按需读取。
- 安装或修改 Skill 后，在构想台的 Skill 设置窗口点击“刷新列表”。
- Skill 开关关闭时，构想台不会在对话请求中扫描、读取或注入 Skill。

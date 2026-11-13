# bb-plugin-vault

<p align="center">
  <strong>read-only markdown vaults, as a page, a thread panel, and a 3D graph.</strong>
</p>

<p align="center">
  <a href="#install">install</a> · <a href="#what-it-does">what it does</a> · <a href="#related">related</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-666666?labelColor=333333" alt="MIT license" /></a>
</p>

---

A BB plugin that browses markdown folders and never writes. Add vault folders in Settings, then drag to set tab order.

- **page / panel** — nav panel plus a thread side-panel tab; open notes as rendered markdown
- **graph** — 3D wiki-link graph; click a node to open the file
- **agents** — `::vault-file` and `::vault-graph` directives open the thread panel without leaving chat
- **reduced motion** — skips enter/leave animation when the host asks for it

## install

Requires [bb](https://getbb.app) with a compatible Plugin SDK (`engines` in `package.json`).

From a clone:

```bash
git clone https://github.com/INUtilities/bb-plugin-vault.git
cd bb-plugin-vault
bb plugin install . --yes
```

Or from GitHub:

```bash
bb plugin install 'git:https://github.com/INUtilities/bb-plugin-vault.git@main' --yes
```

Plugin id: `vault`.

## what it does

Registers `navPanel` `docs`, `threadPanelAction`, a settings section, and message directives in `app.tsx`. Agents can also open the thread panel through plugin tools.

## 스레드에서 파일과 문구 표시

`vault_focus_file`은 호출한 스레드의 데스크탑 오른쪽 Vault 패널에 파일 표시를 요청한다.
문구 강조와 그래프 동시 표시는 데스크탑 스레드 패널에만 적용한다.
새 tool이 보이지 않는 기존 agent 세션에서는 새 세션을 시작한다.
`path`는 볼트 안의 파일 경로이며, 볼트가 여러 개면 `vaultId`를 지정한다.
`highlights`에는 화면에 보이는 연속 텍스트를 최대 8개 넣는다. 문구는 각각
1,000자까지이며 공백과 줄바꿈은 유연하게 맞춘다. `occurrence`는 1부터
시작하는 순서이고 생략하면 첫 번째다. 생략하거나 빈 배열을 보내면 이전
문구 강조를 지운다. Markdown과 텍스트 파일만 강조를 지원한다. HTML과
이미지는 파일을 열 수 있지만 문구 강조는 요청할 수 없다.

`graphPaths`에 Markdown 경로를 넣으면 그래프를 열고 붉은 점 목록을 교체한다.
빈 배열은 점을 지우며, 생략하면 기존 그래프 상태를 유지한다. 기존
`vault_open_graph`의 점 누적 방식은 그대로다. 채팅의 `vault-focus` 칩을
다시 누르면 해당 위치로 다시 이동한다. 실제 일치 여부는 패널에서 확인한다.

## related

| plugin | role |
| --- | --- |
| `codes` | workspace files and git graph |
| `finder` | disk tree without claiming the file opener |

## license

MIT. See [LICENSE](LICENSE).

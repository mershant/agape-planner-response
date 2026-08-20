---
type: Preserved Source Note
title: David's Planner Context Contract
description: Preserves the required Planner wrapper, history controls, Summaryception gate, preset option, and Planning terminology.
tags: [source, david, planner, history, summaryception, preset]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-20T09:07:29Z }
---

# Context relationship

David supplied the Planner context shape:

> Here:
> `<system>`
> this is it's purpose
> `</system>`
>
> `<history>`
> conversation history. there should be an option to how much history it can see using depths. it should support summaryception. the original agape lite ahd this, if it doesnt currently thats a huge fucking regression. thats the entire reason why i had athis ported here. and that should be an option as well, if to include the summaryception. Summaryception option can only be enabled if full history can be seen, it cant be enabled if depths only.
> `</history>`
>
> `<planner_template>`
> where the users template goes
> `</..>`
>
> YOU should not call this REASDOANING, call it PLNANING> dont tell the AI to never CALL IT REASONING because this instruction is for you DUMBASS.
>
> what i just gaev you should be what planner sees as its context

David added the final ordering relationship:

> then right after the template is its incentive to start the planner.

# Context options

David directed a second context choice:

> and add another option: for the planner to be able to see the preset. so there should be dropdowns of: minimal ctx (the one i proposed), and then being able to just see the preset as well. but it must wrap the whole preset in one `<preset>` so it can distinsguih it as a separate thing. and it should apply the same concept of minimal like:
>
> `<system>` or `<task>`
> stating its task.
>
> `<planner_template>`
>
> shit like that.

David then removed the separate hybrid idea about exposing only preset variables:

> abandon this idea since being able to see the preset solves: `i forgot but there's a flaw to what i just said: it should still see the thing i proposed, but still see the preset's variables of the current active preset one (ff5).`

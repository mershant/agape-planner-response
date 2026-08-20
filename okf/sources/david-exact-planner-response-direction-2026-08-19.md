---
type: Preserved Source Note
title: David's Exact Planner to Response Direction
description: Preserves the correction that replaced RP-01 and authorized complete isolated implementation.
tags: [source, david, planner, response, implementation]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-19T20:34:45Z }
---

# Product correction

David replaced the proposed bare Response packet with this relationship:

> Planner has a text box that you can input a planner response, the output it
> gives is in the reasoning box. You can select whatever preset. Planner has
> its own thing that makes it plan ALONE, im thinking it doesnt need a preset
> of it's own, rather a customized thing, where it just outputs whatever you
> give it.

The supplied example Planner prompt uses native SillyTavern macros including
`{{getvar::...}}`, `{{roll::...}}`, and `{{trim}}`. David then stated:

> it should be able to read variables as well. you can figure out how to access
> sillytavern in rp-prompting, it can copy my current chat setup into
> sillytavern dev.

> then the response part is as expected, where it just outputs a response like
> normal.

> you can select two models for each if user want. by default, it just uses the
> connection profile model. you can keep the feature where you can: input the
> custom api, connection profile. the important part is how the default preset
> that user has on sees the reasoning, it just sees it as the last thing they
> see, right below all the preset prompts.

# Clarifications

David selected one model per stage, temporary use of a selected Response
profile for that Send, and Chat Completion as the first supported API mode.
When asked whether direct custom API fields or SillyTavern profiles should be
supported, David answered:

> literally both. itold you already

When an implementation limitation was incorrectly presented as ambiguity about
when Planning should appear, David corrected the sequence:

> wtf are you talking aabout? When the message begins, first makes the planning
> from the prompt you insert then it responds using that planning

# Implementation authorization and boundary

David authorized completion while restricting all operational work to this
repository and isolated SillyTavern Dev:

> i plan to sleep now. I hand you free reign to only: STD-dev (RP-prompting repo
> has instructions for that), this repo. Complete the extension.

The `rp-prompting` snapshot procedure may read main SillyTavern to capture the
latest saved chat, but it may write only to SillyTavern Dev and may stop only
the Dev service. No main SillyTavern file, process, credential, or configuration
is authorized for modification.

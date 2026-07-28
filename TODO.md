# TODO

## v1 Gaps

### Slack Pagination
- [ ] Paginate `conversations.history` (currently only first 100 messages per channel)
- [ ] Increase channel limit beyond 10
- [ ] Handle pagination for `users.conversations`
- [ ] Add saved items support (threads user participated in)

### Global Install
- [ ] `npm install -g .` or add install script
- [ ] Optionally publish to npm

### GitHub Review Date Precision
- [ ] Handle inline review comments that aren't formal reviews (Approval/Changes Requested)

### AI Provider
- [ ] Add Anthropic support (optional — mostly YAGNI unless user requests)

### Polish
- [ ] Handle case when no config file exists gracefully in all commands
- [ ] Add `--version` to display tool version
- [ ] Add help text for subcommands

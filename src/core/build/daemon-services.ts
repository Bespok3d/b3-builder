// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Services the DAEMON serves, never a plugin. A manifest that requires one of these is asking for a
// new-enough daemon build, not for another plugin to be installed, so it must never become a catalog
// `deps` entry: no plugin has that id, so a reader that believes it goes looking for a package that
// cannot exist, refuses this plugin, and then refuses every plugin that depended on this one.
// Mirrors daemon/core/packages/daemon_services.py.
export const DAEMON_SERVED_SERVICES = new Set(['migrate-patch'])

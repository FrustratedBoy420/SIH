import { Component, type ReactNode } from 'react'

/** Catches a renderer failure (a lost WebGL context, say) and shows the fallback instead of a blank region. */
export default class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { /* the fallback is the report; nothing to log to */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

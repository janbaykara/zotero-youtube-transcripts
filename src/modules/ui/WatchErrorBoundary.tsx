import { Component, type ComponentChildren } from "preact";

interface Props {
  children: ComponentChildren;
}

interface State {
  error: string | null;
}

/** Surfaces render failures instead of a blank tab. */
export class WatchErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  componentDidCatch(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    ztoolkit.log("WatchErrorBoundary", err);
    this.setState({ error: message });
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: "24px",
            color: "var(--fill-primary, CanvasText)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Watch tab failed to render: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

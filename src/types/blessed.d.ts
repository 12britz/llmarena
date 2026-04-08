declare module 'blessed' {
  export interface BoxOptions {
    parent?: Widgets.Screen;
    top?: string | number;
    left?: string | number;
    width?: string | number;
    height?: string | number;
    border?: { type: string; fg?: string };
    style?: any;
    content?: string;
    tags?: boolean;
    scrollable?: boolean;
    alwaysScroll?: boolean;
  }

  export interface TextboxOptions extends BoxOptions {
    placeholder?: string;
  }

  export interface Widgets {
    Screen: any;
    Box: any;
    Textbox: any;
  }

  export namespace Widgets {
    class Screen {
      constructor(options: any);
      append(element: any): void;
      key(keys: string[], callback: (key: string) => void): void;
      key(keys: string[], callback: () => void): void;
      on(event: string, callback: () => void): void;
      render(): void;
    }

    class Box {
      constructor(options: BoxOptions);
      setContent(content: string): void;
      detach(): void;
      on(event: string, callback: (data: any) => void): void;
      focus(): void;
    }

    class Textbox extends Box {
      constructor(options: TextboxOptions);
      getValue(): string;
      setValue(value: string): void;
      submit(): void;
    }

    class Message {
      error(message: string): void;
    }
  }

  export function box(options: BoxOptions): Widgets.Box;
  export function screen(options: any): Widgets.Screen;
  export function textbox(options: TextboxOptions): Widgets.Textbox;
  export function message(options: any): Widgets.Message;
}

declare module 'blessed-contrib' {
  export namespace Widgets {
    class GridOptions {
      rows?: number;
      cols?: number;
    }
  }
}

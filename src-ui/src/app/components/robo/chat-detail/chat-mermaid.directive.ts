import {
  AfterViewInit,
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  inject,
} from '@angular/core'

type Mermaid = Awaited<typeof import('mermaid')>['default']

let mermaidLoader: Promise<Mermaid> | null = null
let mermaidInitialized = false
let mermaidRenderSequence = 0

async function getMermaid(): Promise<Mermaid> {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then(({ default: mermaid }) => {
      if (!mermaidInitialized) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
        })
        mermaidInitialized = true
      }

      return mermaid
    })
  }

  return mermaidLoader
}

@Directive({
  selector: 'markdown[pngxRoboChatMermaid]',
  standalone: true,
})
export class ChatMermaidDirective implements AfterViewInit, OnDestroy {
  private host = inject(ElementRef<HTMLElement>)
  private zone = inject(NgZone)
  private observer?: MutationObserver
  private renderQueued = false

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.queueRender()
      this.observer = new MutationObserver(() => this.queueRender())
      this.observer.observe(this.host.nativeElement, {
        childList: true,
        subtree: true,
        characterData: true,
      })
    })
  }

  ngOnDestroy(): void {
    this.observer?.disconnect()
  }

  private queueRender(): void {
    if (this.renderQueued) {
      return
    }

    this.renderQueued = true
    queueMicrotask(() => {
      this.renderQueued = false
      void this.renderMermaidBlocks()
    })
  }

  private async renderMermaidBlocks(): Promise<void> {
    const hostElement = this.host.nativeElement as HTMLElement
    const codeBlocks = Array.from(
      hostElement.querySelectorAll(
        'pre > code.language-mermaid, pre > code.lang-mermaid'
      )
    ) as HTMLElement[]

    if (codeBlocks.length === 0) {
      return
    }

    const mermaid = await getMermaid()

    for (const codeBlock of codeBlocks) {
      const source = codeBlock.textContent?.trim()
      const pre = codeBlock.parentElement
      if (!pre || !source) {
        continue
      }

      try {
        const id = `robo-mermaid-${++mermaidRenderSequence}`
        const { svg, bindFunctions } = await mermaid.render(id, source)
        const container = pre.ownerDocument.createElement('div')
        container.className = 'robo-mermaid-diagram'
        container.innerHTML = svg
        pre.replaceWith(container)
        bindFunctions?.(container)
      } catch {
        pre.classList.add('robo-mermaid-diagram-error')
      }
    }
  }
}

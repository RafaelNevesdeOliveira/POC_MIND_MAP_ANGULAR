import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import { Router } from '@angular/router';
import nodeHtmlLabel from 'cytoscape-node-html-label';

cytoscape.use(nodeHtmlLabel);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements AfterViewInit {
  private cy?: Core;
  private baseZoom = 1;
  isBrowser = false;
  private expandedNodes: Set<string> = new Set();

  @ViewChild('cyContainer', { static: false }) cyContainer!: ElementRef;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private router: Router
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      const cache = localStorage.getItem('expandedNodes');
      if (cache) {
        this.expandedNodes = new Set(JSON.parse(cache));
      }
    }
  }

  private allNodes: ElementDefinition[] = [
    { data: { id: 'prefeitura', label: 'Prefeitura de São Paulo', level: 0 } },
    { data: { id: 'cultura', label: 'Secretaria de Cultura', parentId: 'prefeitura', level: 1 } },
    { data: { id: 'habitacao', label: 'Secretaria de Habitação', parentId: 'prefeitura', level: 1 } },
    { data: { id: 'seguranca', label: 'Secretaria de Segurança Pública', parentId: 'prefeitura', level: 1 } },
    { data: { id: 'subprefeituras', label: 'Secretaria de Subprefeituras', parentId: 'prefeitura', level: 1 } },
    { data: { id: 'desenvolvimento', label: 'Secretaria de Desenvolvimento', parentId: 'prefeitura', level: 1 } },
    { data: { id: 'museus', label: 'Museus', parentId: 'cultura', level: 2 } },
    { data: { id: 'teatro', label: 'Teatro Municipal', parentId: 'cultura', level: 2 } },
    { data: { id: 'pmsp', label: 'Guarda Civil Metropolitana', parentId: 'seguranca', level: 2 } },
  ];

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;

    const initialNodes: ElementDefinition[] = this.allNodes
      .filter((node) => node.data['level'] === 0)
      .map((node) => this.enrichNodeWithAccess(node));
    const initialEdges: ElementDefinition[] = [];

    this.cy = cytoscape({
      container: this.cyContainer.nativeElement,
      elements: [...initialNodes, ...initialEdges],
      style: [
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#e00',
            'target-arrow-color': '#e00',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
      ],
      layout: {
        name: 'breadthfirst',
        directed: true,
        spacingFactor: 1.5,
        animate: true,
        animationDuration: 500,
        roots: this.getRoots(),
        nodeDimensionsIncludeLabels: true,
        fit: true,
        padding: 30,
        circle: false,
      },
    });

    (this.cy as any).nodeHtmlLabel([
      {
        query: 'node',
        halign: 'center',
        valign: 'center',
        halignBox: 'center',
        valignBox: 'center',
        tpl: (data: any) => {
          const hasChildren = this.allNodes.some(n => n.data['parentId'] === data.id);
          const titleClass = hasChildren ? 'node-title has-children' : 'node-title';

          return `
            <div style="
              font-weight: bold;
              padding: 8px;
              border: 1px solid #000;
              border-radius: 6px;
              background: #fff;
              text-align: center;
              max-width: 150px;
            " data-id="${data.id}" class="node-box">
              <div class="${titleClass}" style="color: #000;">${data.label}</div>
              <div style="color: #e00; margin-top: 6px; cursor: pointer;" class="access-btn">Acessar →</div>
            </div>
          `;
        },
      },
    ]);

    Array.from(this.expandedNodes).forEach((id) => this.revealChildren(id, false));

    this.cy.container()?.addEventListener('click', (e: any) => {
      if (e.target.classList.contains('access-btn')) {
        const nodeEl = e.target.closest('[data-id]');
        if (!nodeEl) return;
        const nodeId = nodeEl.getAttribute('data-id');
        this.router.navigate(['/detalhes', nodeId]);
      } else if (e.target.classList.contains('node-title') && e.target.classList.contains('has-children')) {
        const nodeId = e.target.closest('[data-id]')?.getAttribute('data-id');
        if (!nodeId) return;
        if (this.expandedNodes.has(nodeId)) {
          this.collapseChildren(nodeId);
        } else {
          this.revealChildren(nodeId);
        }
      }
    });

    this.cy.container()?.addEventListener('mouseover', (e: any) => {
      if (e.target.classList?.contains('node-title') && e.target.classList.contains('has-children')) {
        e.target.style.color = '#666';
        e.target.style.cursor = 'pointer';
      }
    });

    this.cy.container()?.addEventListener('mouseout', (e: any) => {
      if (e.target.classList?.contains('node-title') && e.target.classList.contains('has-children')) {
        e.target.style.color = '#000';
        e.target.style.cursor = 'default';
      }
    });
  }

  private enrichNodeWithAccess(node: ElementDefinition): ElementDefinition {
    return {
      data: { ...node.data },
    };
  }

  revealChildren(parentId: string, save = true) {
    if (!this.cy) return;

    const children = this.allNodes.filter((n) => n.data['parentId'] === parentId);
    const newElements: ElementDefinition[] = [];

    children.forEach((child) => {
      if (!this.cy!.getElementById(child.data.id!).length) {
        newElements.push(this.enrichNodeWithAccess(child));
        newElements.push({
          group: 'edges',
          data: { source: child.data['parentId']!, target: child.data.id! },
        });
      }
    });

    if (newElements.length > 0) {
      const added = this.cy.add(newElements);
      added.nodes().style({ opacity: 0 });

      this.cy.layout({
        name: 'breadthfirst',
        directed: true,
        spacingFactor: 1.5,
        animate: true,
        animationDuration: 500,
        fit: false,
        roots: this.getRoots(),
      }).run();

      setTimeout(() => {
  if (this.cy!.zoom() > 1.2) {
    this.cy!.zoom(1.2); // limita o zoom
    this.cy!.center();
  }
}, 600);

      added.nodes().animate({ style: { opacity: 1 } }, { duration: 500 });
    }

    if (save) {
      this.expandedNodes.add(parentId);
      localStorage.setItem('expandedNodes', JSON.stringify(Array.from(this.expandedNodes)));
    }
  }

  collapseChildren(parentId: string) {
    if (!this.cy) return;

    const toRemove: string[] = [];
    const collect = (id: string) => {
      const directChildren = this.allNodes.filter((n) => n.data['parentId'] === id);
      for (const child of directChildren) {
        toRemove.push(child.data.id!);
        collect(child.data.id!);
      }
    };
    collect(parentId);

    toRemove.forEach((id) => this.cy!.getElementById(id).remove());

    this.expandedNodes.delete(parentId);
    localStorage.setItem('expandedNodes', JSON.stringify(Array.from(this.expandedNodes)));

    this.cy.layout({
      name: 'breadthfirst',
      directed: true,
      spacingFactor: 1.5,
      animate: true,
      animationDuration: 500,
      fit: false,
      roots: this.getRoots(),
    }).run();
  }

  private getRoots(): string[] {
    return this.cy?.nodes().filter((n) => !n.data('parentId')).map((n) => n.id()) ?? [];
  }

  zoomIn() {
    if (this.cy) {
      this.baseZoom += 0.1;
      this.cy.zoom(this.baseZoom);
      this.cy.center();
    }
  }

  zoomOut() {
    if (this.cy) {
      this.baseZoom -= 0.1;
      this.cy.zoom(this.baseZoom);
      this.cy.center();
    }
  }
}
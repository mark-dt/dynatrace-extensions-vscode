export const attributeSnippet = `\
- type: ATTRIBUTE
  attribute:
    key: <attribute-key>
    displayName: <attribute-name>`;

export const relationSnippet = `\
- type: RELATION
  relation:
    entitySelectorTemplate: <selector>
    displayName: <relation-name>`;

export const graphChartSnippet = `\
- displayName: <metric-key>
  visualizationType: GRAPH_CHART
  graphChartConfig:
    metrics:
      - metricSelector: <metric-key>:splitBy("dt.entity.<entity-type>")`;

export const chartCardSnippet = `\
- key: <card-key>
  numberOfVisibleCharts: 3
  displayName: <card-name>
  charts:
<charts>`;

export const entitiesListCardSnippet = `\
- key: <card-key>
  pageSize: <page-size>
  displayName: <card-name>
  displayCharts: false
  enableDetailsExpandability: true
  numberOfVisibleCharts: 3
  displayIcons: true
  entitySelectorTemplate: <entity-selector>
  hideEmptyCharts: true
  filtering:
    relationships: []
    entityFilters: []
  columns: []
  charts: []`;

export const filteringSnippet = `\
filtering:
  relationships: []
  entityFilters: []`;

export const entityFilterSnippet = `\
- displayName: <group-name>
  filters: []`;

export const filterSnippet = `\
- type: <filter-prop>
  displayName: <filter-name>
  freeText: <free-text>
  modifier: <modifier>
  distinct: <distinct>
  entityTypes:
    - <filtered-entity>`;
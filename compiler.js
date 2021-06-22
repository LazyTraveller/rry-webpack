const fs = require('fs')
const parser = require('@babel/parser')
const options = require('./webpack.config')
const traverse = require('@babel/traverse')
const path = require('path')
const { transformFromAst } = require('@babel/core')

/** 使用@babel/parser,这是 babel7 的工具,来帮助我们分析内部的语法,包括 es6,返回一个 AST 抽象语法树 */
const Parser = {
  getAst: path => {
    /** 读取入口文件 */
    const content = fs.readFileSync(path, 'utf-8')
    /** 将文件内容转为AST抽象语法树 */
    return parser.parse(content, {
      sourceType: 'module'
    })
  },

  /** Babel 提供了@babel/traverse(遍历)方法维护这 AST 树的整体状态 */
  getDependecies: (ast, filename) => {
    const dependecies = {}
    traverse(ast, {
      ImportDeclaration({ node }) {
        const dirname = path.dirname(filename)
        const filePath = './' + path.join(dirname, node.source.value)
        dependecies[node.source.value] = filePath
      }
    })

    return dependecies
  },
  getCode: ast => {
    const { code } = transformFromAst(ast, null, {
      presets: ['@babel/preset-env']
    })
    return code
  }
}

class Compiler {
  constructor(options) {
    /** webpack配置 */
    const { entry, output } = options
    /** 入口 */
    this.entry = entry
    /** 出口 */
    this.output = output
    /** 模块 */
    this.modules = []
  }

  run() {
    const info = this.build(this.entry)
    this.modules.push(info)
    this.modules.forEach(({ dependecies }) => {
      if (dependecies) {
        for(const dependecie in dependecies) {
          this.modules.push(this.build(dependecies[dependecie]))
        }
      }
    })

    const dependencyGraph = this.modules.reduce((graph, item) => ({
      ...graph, 
      [item.filename]: {
        dependecies: item.dependecies,
        code: item.code
      }
    }), {})
    
    this.generate(dependencyGraph)
  }

  /** 构建启动 */
  build(filename){
    const { getAst, getDependecies, getCode } = Parser
    const ast = getAst(filename)
    const dependecies = getDependecies(ast, filename)
    const code = getCode(ast)
    return {
      filename, 
      dependecies, 
      code
    }
  }

  /** 重写require，输出bundle */
  generate() {
     // 输出文件路径   
     const filePath = path.join(this.output.path, this.output.filename)  
      // 懵逼了吗? 没事,下一节我们捋一捋   
     const bundle = `(function(graph){   
         function require(module){     
           function localRequire(relativePath){   
                 return require(graph[module].dependecies[relativePath])  
              }      
          var exports = {};    
            (function(require,exports,code){  
                eval(code)  
            })(localRequire,exports,graph[module].code);      
            return exports;   
           }  
            require('${this.entry}') 
         })(${JSON.stringify(code)})` 
             // 把文件内容写入到文件系统   
           fs.writeFileSync(filePath, bundle, 'utf-8')

  }
}

new Compiler(options).run()
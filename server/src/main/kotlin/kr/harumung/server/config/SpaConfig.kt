package kr.harumung.server.config

import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

/**
 * PWA(web/dist → resources/static)를 같은 서버에서 서빙한다.
 * 앱 라우트는 index.html로 돌려서 새로고침해도 React Router가 받게 한다.
 * API(/v1), 앨범(/a), 액추에이터는 제외.
 */
@Configuration
class SpaConfig : WebMvcConfigurer {
    override fun addViewControllers(registry: ViewControllerRegistry) {
        listOf("/folders", "/folders/*", "/camera", "/session-review", "/dogs", "/dogs/*", "/send", "/settings")
            .forEach { registry.addViewController(it).setViewName("forward:/index.html") }
    }
}
